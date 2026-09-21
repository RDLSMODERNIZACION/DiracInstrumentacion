from datetime import date, datetime
from decimal import Decimal
from uuid import UUID
from calendar import monthrange

from fastapi import APIRouter, Query
from psycopg.rows import dict_row

from app.db import get_conn

router = APIRouter(
    prefix="/kpi/operation-reliability",
    tags=["kpi-operation-reliability"],
)


def _jsonable(v):
    if v is None:
        return None
    if isinstance(v, (datetime, date)):
        return v.isoformat()
    if isinstance(v, Decimal):
        return float(v)
    if isinstance(v, UUID):
        return str(v)
    return v


def _clean_row(row: dict) -> dict:
    return {k: _jsonable(v) for k, v in row.items()}


def _fetch_all(sql: str, params: tuple = ()) -> list[dict]:
    with get_conn() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(sql, params)
            return [_clean_row(dict(r)) for r in cur.fetchall()]


def _fetch_one(sql: str, params: tuple = ()) -> dict:
    with get_conn() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(sql, params)
            row = cur.fetchone()
            return _clean_row(dict(row)) if row else {}


def _month_bounds(month: str | None):
    if not month:
        today = date.today()
        year = today.year
        month_num = today.month
    else:
        parts = month.split("-")
        year = int(parts[0])
        month_num = int(parts[1])

    start = date(year, month_num, 1)
    end = date(year, month_num, monthrange(year, month_num)[1])
    return start, end


@router.get("/summary")
def get_operation_reliability_summary(
    location_id: int | None = Query(default=None),
):
    sql = """
        select
            (
                select count(*)
                from kpi.v_tank_critical_events_detail
                where status = 'active'
                  and (%s::bigint is null or location_id = %s::bigint)
            )::int as active_tank_events,

            (
                select count(*)
                from kpi.v_tank_critical_events_detail
                where (%s::bigint is null or location_id = %s::bigint)
            )::int as total_tank_events,

            (
                select count(*)
                from kpi.v_operation_pumps_front
                where current_state = 'run'
                  and (%s::bigint is null or location_id = %s::bigint)
            )::int as pumps_running,

            (
                select count(*)
                from kpi.v_operation_pumps_front
                where current_state = 'stop'
                  and (%s::bigint is null or location_id = %s::bigint)
            )::int as pumps_stopped,

            (
                select coalesce(sum(starts_count), 0)
                from kpi.v_operation_pumps_front
                where (%s::bigint is null or location_id = %s::bigint)
            )::int as total_starts,

            (
                select coalesce(sum(stops_count), 0)
                from kpi.v_operation_pumps_front
                where (%s::bigint is null or location_id = %s::bigint)
            )::int as total_stops
    """

    return {
        "ok": True,
        "summary": _fetch_one(
            sql,
            (
                location_id,
                location_id,
                location_id,
                location_id,
                location_id,
                location_id,
                location_id,
                location_id,
                location_id,
                location_id,
                location_id,
                location_id,
            ),
        ),
    }


@router.get("/tank-events")
def get_tank_critical_events(
    limit: int = Query(default=50, ge=1, le=500),
    status: str | None = Query(default=None),
    location_id: int | None = Query(default=None),
    tank_id: int | None = Query(default=None),
):
    if status not in ("active", "normalized", None):
        status = None

    sql = """
        select
            id,
            tank_id,
            tank_name,
            location_id,
            location_name,
            event_type,
            event_label,
            configured_limit,
            detected_value,
            started_at,
            ended_at,
            duration_seconds,
            duration_label,
            status,
            status_label,
            created_at
        from kpi.v_tank_critical_events_detail
        where (%s::text is null or status = %s::text)
          and (%s::bigint is null or location_id = %s::bigint)
          and (%s::bigint is null or tank_id = %s::bigint)
        order by started_at desc
        limit %s::int
    """

    return {
        "ok": True,
        "items": _fetch_all(
            sql,
            (
                status,
                status,
                location_id,
                location_id,
                tank_id,
                tank_id,
                limit,
            ),
        ),
    }


@router.get("/pumps")
def get_pump_operation_summary(
    location_id: int | None = Query(default=None),
    pump_id: int | None = Query(default=None),
    state: str | None = Query(default=None),
):
    if state not in ("run", "stop", None):
        state = None

    sql = """
        select
            pump_id,
            pump_name,
            location_id,
            location_name,
            current_state,
            current_state_label,
            online,
            starts_count,
            stops_count,
            running_time_label,
            stopped_time_label,
            availability_pct,
            last_started_at,
            last_stopped_at,
            last_activity_at,
            last_activity_label
        from kpi.v_operation_pumps_front
        where pump_id is not null
          and (%s::bigint is null or location_id = %s::bigint)
          and (%s::bigint is null or pump_id = %s::bigint)
          and (%s::text is null or current_state = %s::text)
        order by location_name, pump_name
    """

    return {
        "ok": True,
        "items": _fetch_all(
            sql,
            (
                location_id,
                location_id,
                pump_id,
                pump_id,
                state,
                state,
            ),
        ),
    }


@router.get("/pump-daily")
def get_pump_daily(
    month: str | None = Query(
        default=None,
        description="Mes en formato YYYY-MM. Si se omite usa el mes actual.",
    ),
    location_id: int | None = Query(default=None),
    pump_id: int | None = Query(default=None),
):
    start, end = _month_bounds(month)

    sql = """
        select
            day_ts,
            pump_id,
            pump_name,
            location_id,
            location_name,
            starts_count,
            stops_count,
            running_seconds,
            stopped_seconds,
            availability_pct,
            total_state_events,
            first_event_at,
            last_event_at,
            estado_operativo,
            problem_score
        from kpi.v_pump_operation_1d_corrected
        where day_ts between %s::date and %s::date
          and (%s::bigint is null or location_id = %s::bigint)
          and (%s::bigint is null or pump_id = %s::bigint)
        order by day_ts asc, problem_score desc, pump_name asc
    """

    items = _fetch_all(
        sql,
        (
            start,
            end,
            location_id,
            location_id,
            pump_id,
            pump_id,
        ),
    )

    return {
        "ok": True,
        "month": start.strftime("%Y-%m"),
        "from": start.isoformat(),
        "to": end.isoformat(),
        "items": items,
    }


@router.get("/pump-daily-chart")
def get_pump_daily_chart(
    month: str | None = Query(default=None),
    location_id: int | None = Query(default=None),
    pump_id: int | None = Query(default=None),
):
    start, end = _month_bounds(month)

    sql = """
        select
            day_ts,
            coalesce(sum(starts_count), 0)::int as total_starts,
            coalesce(sum(stops_count), 0)::int as total_stops,
            round(avg(availability_pct), 2) as avg_availability_pct,
            coalesce(sum(problem_score), 0)::numeric(12,2) as total_problem_score
        from kpi.v_pump_operation_1d_corrected
        where day_ts between %s::date and %s::date
          and (%s::bigint is null or location_id = %s::bigint)
          and (%s::bigint is null or pump_id = %s::bigint)
        group by day_ts
        order by day_ts asc
    """

    return {
        "ok": True,
        "month": start.strftime("%Y-%m"),
        "from": start.isoformat(),
        "to": end.isoformat(),
        "items": _fetch_all(
            sql,
            (
                start,
                end,
                location_id,
                location_id,
                pump_id,
                pump_id,
            ),
        ),
    }


@router.get("/pump-coincidences")
def get_pump_coincidences(
    month: str | None = Query(default=None),
    location_id: int | None = Query(default=None),
    pump_ids: str | None = Query(
        default=None,
        description="IDs de bombas separados por coma. Si se omite analiza todas las del alcance.",
    ),
    threshold_seconds: int = Query(default=300, ge=60, le=1800),
):
    """
    Detecta arranques o paradas de bombas distintas de una misma localidad
    ocurridos con menos de threshold_seconds de diferencia.
    """
    start, end = _month_bounds(month)

    parsed_pump_ids: list[int] | None = None
    if pump_ids:
        try:
            parsed_pump_ids = [int(x.strip()) for x in pump_ids.split(",") if x.strip()]
        except ValueError:
            parsed_pump_ids = None

    sql = """
        with events as (
            select
                v.entity_id::bigint as pump_id,
                v.location_id::bigint as location_id,
                v.event as event_type,
                v.ts as event_ts,
                (v.ts at time zone 'America/Argentina/Buenos_Aires')::date as local_day
            from kpi.v_kpi_stream v
            where v.kind = 'pump'
              and v.metric = 'state'
              and v.event in ('start', 'stop')
              and (v.ts at time zone 'America/Argentina/Buenos_Aires')::date
                    between %s::date and %s::date
              and (%s::bigint is null or v.location_id = %s::bigint)
              and (%s::bigint[] is null or v.entity_id = any(%s::bigint[]))
        )
        select
            a.local_day as day_ts,
            a.location_id,
            l.name as location_name,
            a.event_type,
            a.pump_id as pump_a_id,
            pa.name as pump_a_name,
            a.event_ts as pump_a_ts,
            to_char(a.event_ts at time zone 'America/Argentina/Buenos_Aires', 'HH24:MI:SS') as pump_a_time,
            b.pump_id as pump_b_id,
            pb.name as pump_b_name,
            b.event_ts as pump_b_ts,
            to_char(b.event_ts at time zone 'America/Argentina/Buenos_Aires', 'HH24:MI:SS') as pump_b_time,
            round(abs(extract(epoch from (b.event_ts - a.event_ts)))::numeric, 1) as delta_seconds
        from events a
        join events b
          on b.location_id = a.location_id
         and b.event_type = a.event_type
         and b.local_day = a.local_day
         and b.pump_id > a.pump_id
         and abs(extract(epoch from (b.event_ts - a.event_ts))) < %s
        left join public.pumps pa on pa.id = a.pump_id
        left join public.pumps pb on pb.id = b.pump_id
        left join public.locations l on l.id = a.location_id
        order by a.local_day, a.location_id, least(a.event_ts, b.event_ts)
    """

    items = _fetch_all(
        sql,
        (
            start,
            end,
            location_id,
            location_id,
            parsed_pump_ids,
            parsed_pump_ids,
            threshold_seconds,
        ),
    )

    return {
        "ok": True,
        "month": start.strftime("%Y-%m"),
        "threshold_seconds": threshold_seconds,
        "items": items,
    }


@router.get("/pump-events")
def get_pump_events(
    day: date = Query(..., description="Día local en formato YYYY-MM-DD."),
    location_id: int | None = Query(default=None),
    pump_ids: str | None = Query(
        default=None,
        description="IDs de bombas separados por coma. Si se omite devuelve todas las del alcance.",
    ),
):
    parsed_pump_ids: list[int] | None = None
    if pump_ids:
        try:
            parsed_pump_ids = [int(x.strip()) for x in pump_ids.split(",") if x.strip()]
        except ValueError:
            parsed_pump_ids = None

    sql = """
        select
            v.entity_id::bigint as pump_id,
            v.location_id::bigint as location_id,
            v.event as event_type,
            v.ts as event_ts,
            to_char(
                v.ts at time zone 'America/Argentina/Buenos_Aires',
                'HH24:MI:SS'
            ) as event_time
        from kpi.v_kpi_stream v
        where v.kind = 'pump'
          and v.metric = 'state'
          and v.event in ('start', 'stop')
          and (v.ts at time zone 'America/Argentina/Buenos_Aires')::date = %s::date
          and (%s::bigint is null or v.location_id = %s::bigint)
          and (%s::bigint[] is null or v.entity_id = any(%s::bigint[]))
        order by v.ts asc, v.entity_id asc
    """

    return {
        "ok": True,
        "day": day.isoformat(),
        "items": _fetch_all(
            sql,
            (
                day,
                location_id,
                location_id,
                parsed_pump_ids,
                parsed_pump_ids,
            ),
        ),
    }


@router.get("/pump-event-context")
def get_pump_event_context(
    pump_id: int = Query(..., ge=1),
    event_ts: datetime = Query(..., description="Timestamp ISO del arranque/parada."),
    event_type: str | None = Query(default=None),
    window_minutes: int = Query(default=15, ge=5, le=60),
):
    """
    Contexto sincronizado alrededor de un evento de bomba.

    - Energía: analizador asociado explícitamente en pump_power_analyzers.
    - Presión/caudal: señal del manifold de la misma ubicación de la bomba.
      Este criterio es intencionalmente conservador y se informa en mapping_source.
    - Devuelve series de 15 segundos y promedios antes/después del evento.
    """
    if event_ts.tzinfo is None:
        event_ts = event_ts.replace(tzinfo=datetime.now().astimezone().tzinfo)

    with get_conn() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                """
                select p.id as pump_id, p.name as pump_name, p.location_id, l.name as location_name
                from public.pumps p
                left join public.locations l on l.id = p.location_id
                where p.id = %s
                """,
                (pump_id,),
            )
            pump = cur.fetchone()
            if not pump:
                return {"ok": False, "detail": "Bomba no encontrada"}

            start_ts = event_ts - __import__("datetime").timedelta(minutes=window_minutes)
            end_ts = event_ts + __import__("datetime").timedelta(minutes=window_minutes)

            def avg_pair(table_sql: str, value_expr: str, extra_where: str, params: tuple):
                sql = f"""
                    select
                        avg({value_expr}) filter (
                            where ts >= %s and ts < %s
                        ) as before_value,
                        avg({value_expr}) filter (
                            where ts > %s and ts <= %s
                        ) as after_value
                    from {table_sql}
                    where ts between %s and %s
                      {extra_where}
                """
                cur.execute(
                    sql,
                    (
                        start_ts,
                        event_ts,
                        event_ts,
                        end_ts,
                        start_ts,
                        end_ts,
                        *params,
                    ),
                )
                return cur.fetchone() or {}

            # ----- Energía -----
            cur.execute(
                """
                select ppa.analyzer_id, na.name as analyzer_name
                from public.pump_power_analyzers ppa
                join public.network_analyzers na on na.id = ppa.analyzer_id
                where ppa.pump_id = %s and ppa.enabled = true
                order by ppa.updated_at desc nulls last, ppa.created_at desc nulls last
                limit 1
                """,
                (pump_id,),
            )
            analyzer = cur.fetchone()

            energy = {"available": False, "mapping_source": "pump_power_analyzers", "series": []}
            if analyzer:
                analyzer_id = int(analyzer["analyzer_id"])
                cur.execute(
                    """
                    select
                        date_bin(interval '15 seconds', ts, timestamptz '2001-01-01') as ts,
                        round(avg(p_kw)::numeric, 3) as p_kw,
                        round(avg((coalesce(i_l1,0)+coalesce(i_l2,0)+coalesce(i_l3,0))/3.0)::numeric, 3) as current_a,
                        round(avg(pf)::numeric, 4) as pf
                    from public.network_analyzer_readings
                    where analyzer_id = %s
                      and ts between %s and %s
                    group by 1
                    order by 1
                    """,
                    (analyzer_id, start_ts, end_ts),
                )
                series = [_clean_row(dict(r)) for r in (cur.fetchall() or [])]

                cur.execute(
                    """
                    select
                        avg(p_kw) filter (where ts >= %s and ts < %s) as before_kw,
                        avg(p_kw) filter (where ts > %s and ts <= %s) as after_kw,
                        avg((coalesce(i_l1,0)+coalesce(i_l2,0)+coalesce(i_l3,0))/3.0)
                            filter (where ts >= %s and ts < %s) as before_a,
                        avg((coalesce(i_l1,0)+coalesce(i_l2,0)+coalesce(i_l3,0))/3.0)
                            filter (where ts > %s and ts <= %s) as after_a
                    from public.network_analyzer_readings
                    where analyzer_id = %s
                      and ts between %s and %s
                    """,
                    (
                        start_ts, event_ts, event_ts, end_ts,
                        start_ts, event_ts, event_ts, end_ts,
                        analyzer_id, start_ts, end_ts,
                    ),
                )
                agg = cur.fetchone() or {}
                before_kw = float(agg["before_kw"]) if agg.get("before_kw") is not None else None
                after_kw = float(agg["after_kw"]) if agg.get("after_kw") is not None else None
                before_a = float(agg["before_a"]) if agg.get("before_a") is not None else None
                after_a = float(agg["after_a"]) if agg.get("after_a") is not None else None

                energy = {
                    "available": bool(series),
                    "mapping_source": "pump_power_analyzers",
                    "analyzer_id": analyzer_id,
                    "analyzer_name": analyzer.get("analyzer_name"),
                    "before": {"p_kw": before_kw, "current_a": before_a},
                    "after": {"p_kw": after_kw, "current_a": after_a},
                    "delta": {
                        "p_kw": (after_kw - before_kw) if before_kw is not None and after_kw is not None else None,
                        "current_a": (after_a - before_a) if before_a is not None and after_a is not None else None,
                    },
                    "series": series,
                }

            def load_hydraulic(signal_type: str):
                cur.execute(
                    """
                    select
                        ms.id as signal_id,
                        ms.unit,
                        ms.tag,
                        m.id as manifold_id,
                        m.name as manifold_name
                    from public.manifold_signals ms
                    join public.manifolds m on m.id = ms.manifold_id
                    where m.location_id = %s
                      and ms.signal_type::text = %s
                    order by ms.id
                    limit 1
                    """,
                    (pump.get("location_id"), signal_type),
                )
                sig = cur.fetchone()
                if not sig:
                    return {
                        "available": False,
                        "mapping_source": "same_location_manifold",
                        "series": [],
                    }

                signal_id = int(sig["signal_id"])
                cur.execute(
                    """
                    select
                        date_bin(interval '15 seconds', created_at, timestamptz '2001-01-01') as ts,
                        round(avg(value)::numeric, 4) as value
                    from public.manifold_signal_readings
                    where manifold_signal_id = %s
                      and created_at between %s and %s
                    group by 1
                    order by 1
                    """,
                    (signal_id, start_ts, end_ts),
                )
                series = [_clean_row(dict(r)) for r in (cur.fetchall() or [])]

                cur.execute(
                    """
                    select
                        avg(value) filter (where created_at >= %s and created_at < %s) as before_value,
                        avg(value) filter (where created_at > %s and created_at <= %s) as after_value
                    from public.manifold_signal_readings
                    where manifold_signal_id = %s
                      and created_at between %s and %s
                    """,
                    (start_ts, event_ts, event_ts, end_ts, signal_id, start_ts, end_ts),
                )
                agg = cur.fetchone() or {}
                before_v = float(agg["before_value"]) if agg.get("before_value") is not None else None
                after_v = float(agg["after_value"]) if agg.get("after_value") is not None else None

                return {
                    "available": bool(series),
                    "mapping_source": "same_location_manifold",
                    "signal_id": signal_id,
                    "manifold_id": sig.get("manifold_id"),
                    "manifold_name": sig.get("manifold_name"),
                    "tag": sig.get("tag"),
                    "unit": sig.get("unit"),
                    "before": before_v,
                    "after": after_v,
                    "delta": (after_v - before_v) if before_v is not None and after_v is not None else None,
                    "series": series,
                }

            pressure = load_hydraulic("pressure")
            flow = load_hydraulic("flow")

    return {
        "ok": True,
        "pump": _clean_row(dict(pump)),
        "event": {
            "type": event_type,
            "ts": event_ts.isoformat(),
            "window_minutes": window_minutes,
            "from": start_ts.isoformat(),
            "to": end_ts.isoformat(),
        },
        "energy": energy,
        "pressure": pressure,
        "flow": flow,
    }


@router.get("/pump-ranking")
def get_pump_ranking(
    month: str | None = Query(default=None),
    location_id: int | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
):
    start, end = _month_bounds(month)

    sql = """
        select
            pump_id,
            pump_name,
            location_id,
            location_name,

            coalesce(sum(starts_count), 0)::int as starts_count,
            coalesce(sum(stops_count), 0)::int as stops_count,
            coalesce(sum(running_seconds), 0)::int as running_seconds,
            coalesce(sum(stopped_seconds), 0)::int as stopped_seconds,

            case
                when coalesce(sum(running_seconds + stopped_seconds), 0) > 0 then
                    round(
                        sum(running_seconds)::numeric
                        / nullif(sum(running_seconds + stopped_seconds)::numeric, 0)
                        * 100,
                        2
                    )
                else null
            end as availability_pct,

            coalesce(sum(total_state_events), 0)::int as total_state_events,
            min(first_event_at) as first_event_at,
            max(last_event_at) as last_event_at,
            coalesce(sum(problem_score), 0)::numeric(12,2) as problem_score,

            case
                when coalesce(sum(starts_count), 0) >= 40 then 'ciclado severo'
                when coalesce(sum(starts_count), 0) >= 20 then 'muchos arranques'
                when (
                    coalesce(sum(running_seconds + stopped_seconds), 0) > 0
                    and (
                        sum(running_seconds)::numeric
                        / nullif(sum(running_seconds + stopped_seconds)::numeric, 0)
                        * 100
                    ) < 30
                ) then 'baja disponibilidad'
                when coalesce(sum(starts_count), 0) >= 10 then 'revisar ciclos'
                else 'normal'
            end as estado_operativo

        from kpi.v_pump_operation_1d_corrected
        where day_ts between %s::date and %s::date
          and (%s::bigint is null or location_id = %s::bigint)
        group by
            pump_id,
            pump_name,
            location_id,
            location_name
        order by problem_score desc, starts_count desc, pump_name asc
        limit %s::int
    """

    return {
        "ok": True,
        "month": start.strftime("%Y-%m"),
        "from": start.isoformat(),
        "to": end.isoformat(),
        "items": _fetch_all(
            sql,
            (
                start,
                end,
                location_id,
                location_id,
                limit,
            ),
        ),
    }


@router.get("/tank-daily")
def get_tank_daily(
    month: str | None = Query(default=None),
    location_id: int | None = Query(default=None),
    tank_id: int | None = Query(default=None),
):
    start, end = _month_bounds(month)

    sql = """
        select
            day_ts,
            tank_id,
            tank_name,
            location_id,
            location_name,

            total_events,
            active_events,
            normalized_events,

            low_events,
            low_critical_events,
            high_events,
            high_critical_events,

            min_detected_value,
            max_detected_value,
            avg_detected_value,

            total_duration_seconds,
            estado_operativo
        from kpi.v_tank_operation_1d
        where day_ts between %s::date and %s::date
          and (%s::bigint is null or location_id = %s::bigint)
          and (%s::bigint is null or tank_id = %s::bigint)
        order by day_ts asc, total_events desc, tank_name asc
    """

    return {
        "ok": True,
        "month": start.strftime("%Y-%m"),
        "from": start.isoformat(),
        "to": end.isoformat(),
        "items": _fetch_all(
            sql,
            (
                start,
                end,
                location_id,
                location_id,
                tank_id,
                tank_id,
            ),
        ),
    }


@router.get("/tank-daily-chart")
def get_tank_daily_chart(
    month: str | None = Query(default=None),
    location_id: int | None = Query(default=None),
    tank_id: int | None = Query(default=None),
):
    start, end = _month_bounds(month)

    sql = """
        select
            day_ts,
            coalesce(sum(total_events), 0)::int as total_events,
            coalesce(sum(active_events), 0)::int as active_events,
            coalesce(sum(low_events), 0)::int as low_events,
            coalesce(sum(low_critical_events), 0)::int as low_critical_events,
            coalesce(sum(high_events), 0)::int as high_events,
            coalesce(sum(high_critical_events), 0)::int as high_critical_events,
            coalesce(sum(total_duration_seconds), 0)::int as total_duration_seconds
        from kpi.v_tank_operation_1d
        where day_ts between %s::date and %s::date
          and (%s::bigint is null or location_id = %s::bigint)
          and (%s::bigint is null or tank_id = %s::bigint)
        group by day_ts
        order by day_ts asc
    """

    return {
        "ok": True,
        "month": start.strftime("%Y-%m"),
        "from": start.isoformat(),
        "to": end.isoformat(),
        "items": _fetch_all(
            sql,
            (
                start,
                end,
                location_id,
                location_id,
                tank_id,
                tank_id,
            ),
        ),
    }


@router.get("/tank-ranking")
def get_tank_ranking(
    month: str | None = Query(default=None),
    location_id: int | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
):
    start, end = _month_bounds(month)

    sql = """
        select
            tank_id,
            tank_name,
            location_id,
            location_name,

            coalesce(sum(total_events), 0)::int as total_events,
            coalesce(sum(active_events), 0)::int as active_events,
            coalesce(sum(normalized_events), 0)::int as normalized_events,

            coalesce(sum(low_events), 0)::int as low_events,
            coalesce(sum(low_critical_events), 0)::int as low_critical_events,
            coalesce(sum(high_events), 0)::int as high_events,
            coalesce(sum(high_critical_events), 0)::int as high_critical_events,

            min(min_detected_value) as min_detected_value,
            max(max_detected_value) as max_detected_value,
            round(avg(avg_detected_value), 2) as avg_detected_value,

            coalesce(sum(total_duration_seconds), 0)::int as total_duration_seconds,

            (
                coalesce(sum(total_events), 0) * 2.0
                + coalesce(sum(low_critical_events), 0) * 5.0
                + coalesce(sum(high_critical_events), 0) * 5.0
                + coalesce(sum(active_events), 0) * 8.0
                + case
                    when coalesce(sum(total_duration_seconds), 0) > 3600 then 10
                    else 0
                  end
            )::numeric(12,2) as problem_score,

            case
                when coalesce(sum(active_events), 0) > 0 then 'activo'
                when coalesce(sum(low_critical_events), 0) >= 5 then 'riesgo vacio'
                when coalesce(sum(high_critical_events), 0) >= 5 then 'riesgo rebalse'
                when coalesce(sum(total_events), 0) >= 20 then 'muy inestable'
                when coalesce(sum(total_events), 0) >= 10 then 'inestable'
                when coalesce(sum(total_duration_seconds), 0) > 3600 then 'evento prolongado'
                else 'normal'
            end as estado_operativo

        from kpi.v_tank_operation_1d
        where day_ts between %s::date and %s::date
          and (%s::bigint is null or location_id = %s::bigint)
        group by
            tank_id,
            tank_name,
            location_id,
            location_name
        order by problem_score desc, total_events desc, tank_name asc
        limit %s::int
    """

    return {
        "ok": True,
        "month": start.strftime("%Y-%m"),
        "from": start.isoformat(),
        "to": end.isoformat(),
        "items": _fetch_all(
            sql,
            (
                start,
                end,
                location_id,
                location_id,
                limit,
            ),
        ),
    }

@router.get("/pump-day-events")
def get_pump_day_events(
    day: date = Query(...),
    location_id: int | None = Query(default=None),
    pump_id: int | None = Query(default=None),
):
    sql = """
        select
            psh.id,
            psh.pump_id,
            p.name as pump_name,
            psh.location_id,
            l.name as location_name,
            psh.state,
            case
                when psh.state = 'run' then 'Encendida'
                when psh.state = 'stop' then 'Apagada'
                else psh.state
            end as state_label,
            psh.started_at,
            psh.ended_at,
            psh.duration_seconds,
            case
                when psh.duration_seconds is null then null
                when psh.duration_seconds < 60 then psh.duration_seconds || ' seg'
                when psh.duration_seconds < 3600 then round(psh.duration_seconds / 60.0, 1) || ' min'
                else round(psh.duration_seconds / 3600.0, 1) || ' h'
            end as duration_label,
            psh.source
        from kpi.pump_state_history psh
        left join public.pumps p on p.id = psh.pump_id
        left join public.locations l on l.id = psh.location_id
        where (psh.started_at at time zone 'America/Argentina/Buenos_Aires')::date = %s::date
          and (%s::bigint is null or psh.location_id = %s::bigint)
          and (%s::bigint is null or psh.pump_id = %s::bigint)
        order by psh.started_at asc
    """

    return {
        "ok": True,
        "day": day.isoformat(),
        "items": _fetch_all(
            sql,
            (
                day,
                location_id,
                location_id,
                pump_id,
                pump_id,
            ),
        ),
    }


@router.get("/tank-day-events")
def get_tank_day_events(
    day: date = Query(...),
    location_id: int | None = Query(default=None),
    tank_id: int | None = Query(default=None),
):
    sql = """
        select
            tce.id,
            tce.tank_id,
            t.name as tank_name,
            tce.location_id,
            l.name as location_name,
            tce.event_type,
            case
                when tce.event_type = 'low' then 'Nivel bajo'
                when tce.event_type = 'low_low' then 'Nivel bajo crÃ­tico'
                when tce.event_type = 'high' then 'Nivel alto'
                when tce.event_type = 'high_high' then 'Nivel alto crÃ­tico'
                else tce.event_type
            end as event_label,
            tce.configured_limit,
            tce.detected_value,
            tce.started_at,
            tce.ended_at,
            tce.duration_seconds,
            case
                when tce.duration_seconds is null then null
                when tce.duration_seconds < 60 then tce.duration_seconds || ' seg'
                when tce.duration_seconds < 3600 then round(tce.duration_seconds / 60.0, 1) || ' min'
                else round(tce.duration_seconds / 3600.0, 1) || ' h'
            end as duration_label,
            tce.status,
            case
                when tce.status = 'active' then 'Activo'
                when tce.status = 'normalized' then 'Normalizado'
                else tce.status
            end as status_label
        from kpi.tank_critical_events tce
        left join public.tanks t on t.id = tce.tank_id
        left join public.locations l on l.id = tce.location_id
        where (tce.started_at at time zone 'America/Argentina/Buenos_Aires')::date = %s::date
          and (%s::bigint is null or tce.location_id = %s::bigint)
          and (%s::bigint is null or tce.tank_id = %s::bigint)
        order by tce.started_at asc
    """

    return {
        "ok": True,
        "day": day.isoformat(),
        "items": _fetch_all(
            sql,
            (
                day,
                location_id,
                location_id,
                tank_id,
                tank_id,
            ),
        ),
    }



