# app/routes/kpi/bombas_live.py
import os
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Any, Dict, Optional, List, Tuple
from uuid import UUID

from fastapi import APIRouter, Query, HTTPException, Header
from psycopg.rows import dict_row

from app.db import get_conn

router = APIRouter(prefix="/kpi/bombas", tags=["kpi-bombas"])

LOCAL_TZ = (os.getenv("LOCAL_TZ") or "America/Argentina/Buenos_Aires").strip()

PUMPS_TABLE = (os.getenv("PUMPS_TABLE") or "public.pumps").strip()
LOCATIONS_TABLE = (os.getenv("LOCATIONS_TABLE") or "public.locations").strip()

# Fuente para detectar conectividad.
HB_SOURCE = (os.getenv("PUMP_HB_SOURCE") or "kpi.v_pump_hb_clean").strip()

# Fuente agregada liviana por minuto.
PUMP_STATE_1M = (os.getenv("PUMP_STATE_1M") or "kpi.mv_pump_state_1m").strip()

# Vistas operativas enriquecidas.
OP_PUMP_STATE_1M_FULL = (
    os.getenv("OP_PUMP_STATE_1M_FULL") or "kpi.v_operation_pump_state_1m_full"
).strip()

OP_PUMP_SUMMARY_24H_FULL = (
    os.getenv("OP_PUMP_SUMMARY_24H_FULL") or "kpi.v_operation_pump_summary_24h_full"
).strip()

OP_PUMP_EVENTS = (
    os.getenv("OP_PUMP_EVENTS") or "kpi.v_operation_pump_events"
).strip()

PUMP_CONNECTED_WINDOW_MIN = int(os.getenv("PUMP_CONNECTED_WINDOW_MIN", "5"))

# Para operación conviene 5min por defecto.
DEFAULT_BUCKET = (os.getenv("KPI_PUMPS_BUCKET") or "5min").strip()

ADMIN_REFRESH_TOKEN = (os.getenv("ADMIN_REFRESH_TOKEN") or "").strip()
REFRESH_LOCK_KEY = 987654321


def _jsonable(v):
    if v is None:
        return None
    if isinstance(v, (datetime, date)):
        return v.isoformat()
    if isinstance(v, Decimal):
        return float(v)
    if isinstance(v, UUID):
        return str(v)
    if isinstance(v, timedelta):
        return str(v)
    return v


def _clean_row(row: dict) -> dict:
    return {k: _jsonable(v) for k, v in row.items()}


def _clean_rows(rows) -> List[dict]:
    return [_clean_row(dict(r)) for r in rows or []]


def _bounds_utc_minute(
    date_from: Optional[datetime],
    date_to: Optional[datetime],
) -> Tuple[datetime, datetime, datetime]:
    """
    Devuelve:
      - df_floor: from UTC redondeado a minuto.
      - dt_floor: to UTC redondeado a minuto.
      - now_utc: ahora real UTC.

    Por defecto: últimas 24 hs.
    """
    now_utc = datetime.now(timezone.utc)

    if date_to is None:
        date_to = now_utc

    if date_from is None:
        date_from = date_to - timedelta(hours=24)

    if date_to.tzinfo is None:
        date_to = date_to.replace(tzinfo=timezone.utc)
    else:
        date_to = date_to.astimezone(timezone.utc)

    if date_from.tzinfo is None:
        date_from = date_from.replace(tzinfo=timezone.utc)
    else:
        date_from = date_from.astimezone(timezone.utc)

    dt_floor = date_to.replace(second=0, microsecond=0)
    df_floor = date_from.replace(second=0, microsecond=0)

    if df_floor >= dt_floor:
        raise HTTPException(status_code=400, detail="'from' debe ser menor que 'to'")

    return df_floor, dt_floor, now_utc


def _parse_ids(csv: Optional[str]) -> Optional[List[int]]:
    if not csv:
        return None

    out: List[int] = []

    for t in csv.split(","):
        t = t.strip()
        if not t:
            continue

        try:
            out.append(int(t))
        except Exception:
            pass

    return out or None


def _validate_bucket(bucket: str) -> str:
    bucket = (bucket or DEFAULT_BUCKET or "5min").strip()

    if bucket not in ("1min", "5min", "15min", "1h", "1d"):
        raise HTTPException(status_code=400, detail="bucket inválido")

    return bucket


def _bucket_expr_sql(col: str, bucket: str) -> str:
    """
    Devuelve expresión SQL para agrupar timestamps.
    Para 1d usa día local Argentina.
    """
    bucket = _validate_bucket(bucket)

    if bucket == "1min":
        return f"date_trunc('minute', {col})"

    if bucket == "5min":
        return (
            f"date_trunc('hour', {col}) "
            f"+ ((extract(minute from {col})::int / 5) * 5) * interval '1 min'"
        )

    if bucket == "15min":
        return (
            f"date_trunc('hour', {col}) "
            f"+ ((extract(minute from {col})::int / 15) * 15) * interval '1 min'"
        )

    if bucket == "1h":
        return f"date_trunc('hour', {col})"

    if bucket == "1d":
        return (
            f"date_trunc('day', {col} at time zone '{LOCAL_TZ}') "
            f"at time zone '{LOCAL_TZ}'"
        )

    return f"date_trunc('minute', {col})"


def _state_label_sql(alias: str = "state") -> str:
    return f"""
        case
            when {alias} = 'run' then 'Encendida'
            when {alias} = 'stop' then 'Apagada'
            else {alias}
        end
    """


def _duration_label_sql(expr: str) -> str:
    return f"""
        case
            when {expr} is null then null
            when {expr} < 60 then round({expr}) || ' seg'
            when {expr} < 3600 then round({expr} / 60.0, 1) || ' min'
            else round({expr} / 3600.0, 1) || ' h'
        end
    """


@router.post("/refresh")
def refresh_mv_pump_state_1m(x_token: str = Header(default="", alias="X-Token")):
    """
    Refresca la MV kpi.mv_pump_state_1m.
    """
    if not ADMIN_REFRESH_TOKEN:
        raise HTTPException(status_code=500, detail="ADMIN_REFRESH_TOKEN no configurado")

    if x_token != ADMIN_REFRESH_TOKEN:
        raise HTTPException(status_code=401, detail="unauthorized")

    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        cur.execute("select pg_try_advisory_lock(%s) as ok;", (REFRESH_LOCK_KEY,))
        row = cur.fetchone()
        ok = bool(row["ok"]) if row else False

        if not ok:
            return {
                "ok": True,
                "skipped": True,
                "reason": "refresh already running",
            }

        try:
            try:
                cur.execute(f"refresh materialized view concurrently {PUMP_STATE_1M};")
                mode = "concurrently"
            except Exception:
                conn.rollback()
                cur.execute(f"refresh materialized view {PUMP_STATE_1M};")
                mode = "normal_fallback"

            cur.execute(
                f"""
                select
                  max(minute_ts) as last_minute,
                  now() - max(minute_ts) as lag
                from {PUMP_STATE_1M};
                """
            )
            r = cur.fetchone() or {}

            return {
                "ok": True,
                "mode": mode,
                "last_minute": (
                    r.get("last_minute").isoformat()
                    if r.get("last_minute")
                    else None
                ),
                "lag": str(r.get("lag")) if r.get("lag") is not None else None,
            }

        finally:
            try:
                cur.execute("select pg_advisory_unlock(%s);", (REFRESH_LOCK_KEY,))
            except Exception:
                pass


@router.get("/live")
def pumps_live(
    company_id: Optional[int] = Query(None),
    location_id: Optional[int] = Query(None),
    pump_ids: Optional[str] = Query(None, description="CSV de pump_id"),
    date_from: Optional[datetime] = Query(None, alias="from"),
    date_to: Optional[datetime] = Query(None, alias="to"),
    bucket: str = Query("1min", pattern="^(1min|5min|15min|1h|1d)$"),
    agg_mode: str = Query("avg", pattern="^(avg|max)$"),
    connected_only: bool = Query(True),
):
    """
    Gráfico legacy de Bombas ON.

    Permite resolución:
      - 1min
      - 5min
      - 15min
      - 1h
      - 1d
    """
    df, dt, now_utc = _bounds_utc_minute(date_from, date_to)
    ids = _parse_ids(pump_ids)
    bucket = _validate_bucket(bucket)

    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        if ids:
            scope_ids_all = ids
        else:
            cur.execute(
                f"""
                with params as (
                  select
                    %s::bigint as company_id,
                    %s::bigint as location_id
                )
                select p.id as pump_id
                from {PUMPS_TABLE} p
                join {LOCATIONS_TABLE} l on l.id = p.location_id
                cross join params
                where (params.company_id is null or l.company_id = params.company_id)
                  and (params.location_id is null or l.id = params.location_id)
                order by p.id
                """,
                (company_id, location_id),
            )
            scope_ids_all = [int(r["pump_id"]) for r in cur.fetchall()]

        pumps_total_all = len(scope_ids_all)

        if pumps_total_all == 0:
            return {
                "timestamps": [],
                "is_on": [],
                "bucket": bucket,
                "agg_mode": agg_mode,
                "pumps_total": 0,
                "pumps_connected": 0,
                "window": {"from": df.isoformat(), "to": dt.isoformat()},
            }

        recent_from = now_utc - timedelta(minutes=PUMP_CONNECTED_WINDOW_MIN)

        cur.execute(
            f"""
            with scope as (
              select unnest(%s::int[]) as pump_id
            )
            select
              s.pump_id,
              h.hb_ts
            from scope s
            left join lateral (
              select h.hb_ts
              from {HB_SOURCE} h
              where h.pump_id = s.pump_id
                and h.hb_ts <= %s
              order by h.hb_ts desc
              limit 1
            ) h on true;
            """,
            (scope_ids_all, now_utc),
        )
        last_rows = cur.fetchall() or []

        connected_set = {
            int(r["pump_id"])
            for r in last_rows
            if r.get("hb_ts") is not None and r["hb_ts"] >= recent_from
        }

        scope_ids = (
            scope_ids_all
            if not connected_only
            else [pid for pid in scope_ids_all if pid in connected_set]
        )

        if not scope_ids:
            return {
                "timestamps": [],
                "is_on": [],
                "bucket": bucket,
                "agg_mode": agg_mode,
                "pumps_total": pumps_total_all,
                "pumps_connected": len(connected_set),
                "window": {"from": df.isoformat(), "to": dt.isoformat()},
            }

        if agg_mode not in ("avg", "max"):
            raise HTTPException(status_code=400, detail="agg_mode inválido")

        bucket_expr = _bucket_expr_sql("minute_ts", bucket)
        agg_sql = "avg(on_count)" if agg_mode == "avg" else "max(on_count)"

        cur.execute(
            f"""
            with bounds as (
              select
                %(df)s::timestamptz as df,
                %(dt)s::timestamptz as dt
            ),
            scope as (
              select unnest(%(ids)s::int[]) as pump_id
            ),
            per_min as (
              select
                m.minute_ts,
                case when m.is_on then 1 else 0 end as on_int
              from {PUMP_STATE_1M} m
              join scope s on s.pump_id = m.pump_id
              where m.minute_ts >= (select df from bounds)
                and m.minute_ts < (select dt from bounds)
            ),
            per_min_sum as (
              select
                minute_ts,
                sum(on_int)::float as on_count
              from per_min
              group by minute_ts
            ),
            bucketed as (
              select
                {bucket_expr} as bucket_ts,
                {agg_sql}::float as val
              from per_min_sum
              group by bucket_ts
            )
            select
              extract(epoch from bucket_ts)::bigint * 1000 as ts_ms,
              val
            from bucketed
            order by bucket_ts;
            """,
            {
                "df": df,
                "dt": dt,
                "ids": scope_ids,
            },
        )

        rows = cur.fetchall() or []

    return {
        "timestamps": [int(r["ts_ms"]) for r in rows],
        "is_on": [None if r["val"] is None else float(r["val"]) for r in rows],
        "bucket": bucket,
        "agg_mode": agg_mode,
        "pumps_total": pumps_total_all,
        "pumps_connected": len(connected_set),
        "window": {"from": df.isoformat(), "to": dt.isoformat()},
    }


@router.get("/operation/timeline-1m")
def operation_pumps_timeline_1m(
    company_id: Optional[int] = Query(None),
    location_id: Optional[int] = Query(None),
    pump_ids: Optional[str] = Query(None, description="CSV de pump_id"),
    date_from: Optional[datetime] = Query(None, alias="from"),
    date_to: Optional[datetime] = Query(None, alias="to"),
    state: Optional[str] = Query(None, pattern="^(run|stop)$"),
    online: Optional[bool] = Query(None),
    data_quality: Optional[str] = Query(None, pattern="^(ok|dato viejo|sin dato)$"),
    limit: int = Query(200000, ge=1, le=300000),
):
    """
    Timeline operativo minuto a minuto por bomba.
    Este endpoint es pesado y debería pedirse solo bajo demanda.
    """
    df, dt, _now_utc = _bounds_utc_minute(date_from, date_to)
    ids = _parse_ids(pump_ids)

    sql = f"""
        select
            v.minute_ts,
            extract(epoch from v.minute_ts)::bigint * 1000 as ts_ms,
            v.day_ts,
            v.local_minute_ts,

            v.pump_id,
            v.pump_name,
            v.location_id,
            v.location_name,

            v.is_on,
            v.state,
            v.state_label,
            v.on_int,

            v.last_hb_at,
            v.age_sec,
            v.online,
            v.data_quality

        from {OP_PUMP_STATE_1M_FULL} v
        left join {LOCATIONS_TABLE} l
          on l.id = v.location_id

        where v.minute_ts >= %(df)s
          and v.minute_ts < %(dt)s

          and (%(company_id)s::bigint is null or l.company_id = %(company_id)s::bigint)
          and (%(location_id)s::bigint is null or v.location_id = %(location_id)s::bigint)
          and (%(pump_ids)s::int[] is null or v.pump_id = any(%(pump_ids)s::int[]))
          and (%(state)s::text is null or v.state = %(state)s::text)
          and (%(online)s::boolean is null or v.online = %(online)s::boolean)
          and (%(data_quality)s::text is null or v.data_quality = %(data_quality)s::text)

        order by
            v.minute_ts asc,
            v.location_name asc nulls last,
            v.pump_name asc nulls last

        limit %(limit)s
    """

    params = {
        "df": df,
        "dt": dt,
        "company_id": company_id,
        "location_id": location_id,
        "pump_ids": ids,
        "state": state,
        "online": online,
        "data_quality": data_quality,
        "limit": limit,
    }

    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        cur.execute(sql, params)
        rows = cur.fetchall() or []

    return {
        "ok": True,
        "window": {"from": df.isoformat(), "to": dt.isoformat()},
        "count": len(rows),
        "items": _clean_rows(rows),
    }


@router.get("/operation/on-1m")
def operation_pumps_on_1m(
    company_id: Optional[int] = Query(None),
    location_id: Optional[int] = Query(None),
    pump_ids: Optional[str] = Query(None, description="CSV de pump_id"),
    date_from: Optional[datetime] = Query(None, alias="from"),
    date_to: Optional[datetime] = Query(None, alias="to"),
    online_only: bool = Query(False),
    bucket: str = Query("5min", pattern="^(1min|5min|15min|1h|1d)$"),
):
    """
    Serie agregada para el gráfico operativo de bombas.

    Optimizado:
      - acepta bucket real, por defecto 5min.
      - usa kpi.mv_pump_state_1m en vez de kpi.v_operation_pump_state_1m_full.
      - no hace select v.*.
      - devuelve el mismo formato que espera el frontend.
    """
    df, dt, _now_utc = _bounds_utc_minute(date_from, date_to)
    ids = _parse_ids(pump_ids)
    bucket = _validate_bucket(bucket)

    bucket_expr = _bucket_expr_sql("m.minute_ts", bucket)

    sql = f"""
        with scope as (
            select
                p.id as pump_id
            from {PUMPS_TABLE} p
            left join {LOCATIONS_TABLE} l
              on l.id = p.location_id
            where (%(company_id)s::bigint is null or l.company_id = %(company_id)s::bigint)
              and (%(location_id)s::bigint is null or p.location_id = %(location_id)s::bigint)
              and (%(pump_ids)s::int[] is null or p.id = any(%(pump_ids)s::int[]))
        ),
        scope_count as (
            select count(*)::int as pumps_total
            from scope
        ),
        filtered as (
            select
                {bucket_expr} as bucket_ts,
                m.pump_id,
                bool_or(m.is_on) as is_on
            from {PUMP_STATE_1M} m
            join scope s
              on s.pump_id = m.pump_id
            where m.minute_ts >= %(df)s
              and m.minute_ts < %(dt)s
            group by bucket_ts, m.pump_id
        ),
        bucketed as (
            select
                f.bucket_ts,

                (select pumps_total from scope_count)::int as pumps_total,

                count(distinct f.pump_id)::int as pumps_online,

                greatest(
                    (select pumps_total from scope_count)::int
                    - count(distinct f.pump_id)::int,
                    0
                )::int as pumps_offline,

                count(distinct f.pump_id) filter (where f.is_on)::int as pumps_on,

                count(distinct f.pump_id) filter (where not f.is_on)::int as pumps_off

            from filtered f
            group by f.bucket_ts
        )
        select
            b.bucket_ts as minute_ts,
            extract(epoch from b.bucket_ts)::bigint * 1000 as ts_ms,
            (b.bucket_ts at time zone '{LOCAL_TZ}') as local_minute_ts,

            case
                when %(online_only)s::boolean then b.pumps_online
                else b.pumps_total
            end::int as pumps_total,

            b.pumps_online,
            case
                when %(online_only)s::boolean then 0
                else b.pumps_offline
            end::int as pumps_offline,

            b.pumps_on,
            b.pumps_off,

            round(
                case
                    when case
                        when %(online_only)s::boolean then b.pumps_online
                        else b.pumps_total
                    end > 0 then
                        b.pumps_on::numeric /
                        case
                            when %(online_only)s::boolean then b.pumps_online
                            else b.pumps_total
                        end::numeric * 100
                    else null
                end,
                2
            ) as pumps_on_pct,

            round(
                case
                    when b.pumps_total > 0 then
                        b.pumps_online::numeric / b.pumps_total::numeric * 100
                    else null
                end,
                2
            ) as online_pct

        from bucketed b
        where (%(online_only)s::boolean = false or b.pumps_online > 0)
        order by b.bucket_ts asc
    """

    params = {
        "df": df,
        "dt": dt,
        "company_id": company_id,
        "location_id": location_id,
        "pump_ids": ids,
        "online_only": online_only,
    }

    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        cur.execute(sql, params)
        rows = cur.fetchall() or []

    items = _clean_rows(rows)

    return {
        "ok": True,
        "bucket": bucket,
        "window": {"from": df.isoformat(), "to": dt.isoformat()},
        "count": len(items),
        "timestamps": [r["ts_ms"] for r in items],
        "pumps_on": [r["pumps_on"] for r in items],
        "pumps_off": [r["pumps_off"] for r in items],
        "pumps_online": [r["pumps_online"] for r in items],
        "pumps_offline": [r["pumps_offline"] for r in items],
        "items": items,
    }


@router.get("/operation/summary-24h")
def operation_pumps_summary_24h(
    company_id: Optional[int] = Query(None),
    location_id: Optional[int] = Query(None),
    pump_ids: Optional[str] = Query(None, description="CSV de pump_id"),
    only_problems: bool = Query(False),
    limit: int = Query(200, ge=1, le=1000),
):
    """
    Resumen operativo de bombas últimas 24h.

    Incluye:
      - estado actual
      - online / data_quality
      - último heartbeat
      - age_sec
      - arranques/paradas 24h
      - tiempo encendida/apagada
      - disponibilidad operativa
      - disponibilidad de comunicación
      - estado operativo
    """
    ids = _parse_ids(pump_ids)

    sql_items = f"""
        select
            s.*
        from {OP_PUMP_SUMMARY_24H_FULL} s
        left join {LOCATIONS_TABLE} l
          on l.id = s.location_id
        where (%(company_id)s::bigint is null or l.company_id = %(company_id)s::bigint)
          and (%(location_id)s::bigint is null or s.location_id = %(location_id)s::bigint)
          and (%(pump_ids)s::int[] is null or s.pump_id = any(%(pump_ids)s::int[]))
          and (
                %(only_problems)s::boolean = false
             or s.estado_operativo <> 'normal'
             or s.online = false
          )
        order by
            s.online asc,
            case
                when s.estado_operativo = 'sin comunicación' then 1
                when s.estado_operativo = 'ciclado severo' then 2
                when s.estado_operativo = 'baja disponibilidad' then 3
                when s.estado_operativo = 'sin marcha' then 4
                when s.estado_operativo = 'alta utilización' then 5
                else 9
            end asc,
            s.starts_24h desc,
            s.availability_pct_24h asc nulls last,
            s.pump_name asc
        limit %(limit)s
    """

    sql_summary = f"""
        with rows as (
            select s.*
            from {OP_PUMP_SUMMARY_24H_FULL} s
            left join {LOCATIONS_TABLE} l
              on l.id = s.location_id
            where (%(company_id)s::bigint is null or l.company_id = %(company_id)s::bigint)
              and (%(location_id)s::bigint is null or s.location_id = %(location_id)s::bigint)
              and (%(pump_ids)s::int[] is null or s.pump_id = any(%(pump_ids)s::int[]))
        )
        select
            count(*)::int as pumps_total,
            count(*) filter (where online)::int as pumps_online,
            count(*) filter (where not online)::int as pumps_offline,

            count(*) filter (where current_state = 'run')::int as pumps_running,
            count(*) filter (where current_state = 'stop')::int as pumps_stopped,

            coalesce(sum(starts_24h), 0)::int as starts_24h,
            coalesce(sum(stops_24h), 0)::int as stops_24h,

            coalesce(sum(running_seconds_24h), 0)::int as running_seconds_24h,
            coalesce(sum(stopped_seconds_24h), 0)::int as stopped_seconds_24h,

            round(avg(availability_pct_24h), 2) as avg_availability_pct_24h,
            round(avg(online_pct_24h), 2) as avg_online_pct_24h,

            count(*) filter (where estado_operativo <> 'normal')::int as pumps_with_alert,
            count(*) filter (where estado_operativo = 'sin comunicación')::int as without_communication,
            count(*) filter (where estado_operativo = 'ciclado severo')::int as cycling_severe,
            count(*) filter (where estado_operativo = 'baja disponibilidad')::int as low_availability,
            count(*) filter (where estado_operativo = 'sin marcha')::int as no_running,
            count(*) filter (where estado_operativo = 'alta utilización')::int as high_utilization

        from rows
    """

    params = {
        "company_id": company_id,
        "location_id": location_id,
        "pump_ids": ids,
        "only_problems": only_problems,
        "limit": limit,
    }

    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        cur.execute(sql_summary, params)
        summary = _clean_row(dict(cur.fetchone() or {}))

        cur.execute(sql_items, params)
        items = _clean_rows(cur.fetchall())

    return {
        "ok": True,
        "window": {"last_hours": 24},
        "summary": summary,
        "count": len(items),
        "items": items,
    }


@router.get("/operation/events")
def operation_pump_events(
    company_id: Optional[int] = Query(None),
    location_id: Optional[int] = Query(None),
    pump_ids: Optional[str] = Query(None, description="CSV de pump_id"),
    date_from: Optional[datetime] = Query(None, alias="from"),
    date_to: Optional[datetime] = Query(None, alias="to"),
    state: Optional[str] = Query(None, pattern="^(run|stop)$"),
    only_open: bool = Query(False),
    limit: int = Query(500, ge=1, le=5000),
):
    """
    Eventos operativos de bombas.

    Devuelve cambios de estado:
      - Encendida
      - Apagada
      - inicio
      - fin
      - duración
      - si está abierto
    """
    df, dt, _now_utc = _bounds_utc_minute(date_from, date_to)
    ids = _parse_ids(pump_ids)

    sql = f"""
        select
            e.id,

            e.started_at as event_ts,
            extract(epoch from e.started_at)::bigint * 1000 as event_ts_ms,

            e.pump_id,
            e.pump_name,
            e.location_id,
            e.location_name,

            e.state,
            e.state_label,

            e.started_at,
            e.ended_at,
            e.duration_seconds,
            e.duration_label,
            e.is_open,
            e.source,
            e.created_at,

            case
                when e.state = 'run' then 'info'
                when e.state = 'stop' then 'normal'
                else 'normal'
            end as severity

        from {OP_PUMP_EVENTS} e
        left join {LOCATIONS_TABLE} l
          on l.id = e.location_id

        where e.started_at < %(dt)s
          and e.ended_at >= %(df)s

          and (%(company_id)s::bigint is null or l.company_id = %(company_id)s::bigint)
          and (%(location_id)s::bigint is null or e.location_id = %(location_id)s::bigint)
          and (%(pump_ids)s::int[] is null or e.pump_id = any(%(pump_ids)s::int[]))
          and (%(state)s::text is null or e.state = %(state)s::text)
          and (%(only_open)s::boolean = false or e.is_open = true)

        order by e.started_at desc
        limit %(limit)s
    """

    params = {
        "df": df,
        "dt": dt,
        "company_id": company_id,
        "location_id": location_id,
        "pump_ids": ids,
        "state": state,
        "only_open": only_open,
        "limit": limit,
    }

    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        cur.execute(sql, params)
        rows = cur.fetchall() or []

    return {
        "ok": True,
        "window": {"from": df.isoformat(), "to": dt.isoformat()},
        "count": len(rows),
        "items": _clean_rows(rows),
    }