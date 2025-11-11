# app/routes/kpi/bombas_live.py
#
# Bombas LIVE (perfil continuo):
# - Devuelve serie por minuto (o bucketizada) de CANTIDAD DE BOMBAS ON en [from,to)
# - Soporta filtros por empresa/ubicación o lista explícita de bombas
# - Carry-forward del estado (step hold) a nivel minuto
# - Opcional: bucket de salida (1min|5min|15min|1h) con agregación avg|max
# - "connected_only": si True (default), sólo cuenta bombas con heartbeats en la ventana
#
# Origen de datos: kpi.pump_heartbeat_parsed (pump_id, hb_ts, relay)
# Tablas de scope (por defecto): public.pumps / public.locations (override por ENV)

import os
from fastapi import APIRouter, Query, HTTPException
from psycopg.rows import dict_row
from typing import Optional, Dict, Any, List, Tuple
from datetime import datetime, timedelta, timezone
from app.db import get_conn

router = APIRouter(prefix="/kpi/bombas", tags=["kpi-bombas"])

# Defaults a tus tablas reales en public.*; si cambian, sobreescribí por ENV.
PUMPS_TABLE = (os.getenv("PUMPS_TABLE") or "public.pumps").strip()
LOCATIONS_TABLE = (os.getenv("LOCATIONS_TABLE") or "public.locations").strip()

# ---------------- helpers de tiempo ----------------
def _bounds_utc_minute(date_from: Optional[datetime], date_to: Optional[datetime]) -> Tuple[datetime, datetime]:
    """Normaliza [from,to] a UTC y los alinea al minuto (sin seg/microseg)."""
    if date_to is None:
        date_to = datetime.now(timezone.utc)
    if date_from is None:
        date_from = date_to - timedelta(hours=24)
    if date_to.tzinfo is None:   date_to   = date_to.replace(tzinfo=timezone.utc)
    else:                        date_to   = date_to.astimezone(timezone.utc)
    if date_from.tzinfo is None: date_from = date_from.replace(tzinfo=timezone.utc)
    else:                        date_from = date_from.astimezone(timezone.utc)
    # redondeo a minuto
    date_to   = date_to.replace(second=0, microsecond=0)
    date_from = date_from.replace(second=0, microsecond=0)
    if date_from >= date_to:
        raise HTTPException(status_code=400, detail="'from' debe ser menor que 'to'")
    return date_from, date_to

def _ceil_minute(ts: datetime) -> datetime:
    if ts.second == 0 and ts.microsecond == 0:
        return ts
    return (ts.replace(second=0, microsecond=0) + timedelta(minutes=1))

# ---------------- helpers de bucket ----------------
def _bucket_to_minutes(b: str) -> int:
    return {"1min": 1, "5min": 5, "15min": 15, "1h": 60}[b]

def _resample_minutes(
    minutes: List[datetime],
    vals: List[int],
    bucket_min: int,
    mode: str = "avg",      # "avg" | "max"
    round_counts: bool = False,
):
    """Agrupa la serie de minutos en buckets de 'bucket_min' minutos.
    - mode=avg|max para el conteo dentro del bucket.
    - round_counts=True redondea el promedio a entero (útil para conteos).
    Retorna (timestamps_ms_al_inicio_de_bucket, valores)."""
    if bucket_min <= 1:
        return [int(m.timestamp() * 1000) for m in minutes], vals

    out_ts: List[int] = []
    out_vals: List[Optional[float]] = []

    acc: List[int] = []
    bucket_start_idx = 0
    for i, v in enumerate(vals):
        acc.append(int(v))
        if ((i + 1) % bucket_min == 0) or (i == len(vals) - 1):
            if acc:
                if mode == "max":
                    vv: float = float(max(acc))
                else:
                    vv = float(sum(acc) / len(acc))
                if round_counts:
                    vv = float(round(vv))
            else:
                vv = 0.0
            out_ts.append(int(minutes[bucket_start_idx].timestamp() * 1000))
            out_vals.append(vv)
            acc = []
            bucket_start_idx = i + 1

    # casteo final a ints si redondeamos; si no, dejamos float (pero serializa ok)
    if mode == "avg" and not round_counts:
        # mantener float para permitir valores fraccionales
        return out_ts, out_vals  # type: ignore[return-value]
    else:
        return out_ts, [int(v) for v in out_vals if v is not None]  # type: ignore[return-value]

# ---------------- endpoint ----------------
@router.get("/live")
def pumps_live(
    company_id: Optional[int] = Query(None, description="Scope por empresa"),
    location_id: Optional[int] = Query(None, description="Filtra por ubicación"),
    pump_ids: Optional[str] = Query(None, description="CSV opcional de pump_id(s)"),
    date_from: Optional[datetime] = Query(None, alias="from"),
    date_to:   Optional[datetime] = Query(None, alias="to"),
    # Ampliaciones para ventanas largas:
    bucket: str = Query("1min", pattern="^(1min|5min|15min|1h)$", description="Resolución de salida"),
    agg_mode: str = Query("avg", pattern="^(avg|max)$", description="Agregación por bucket (avg|max)"),
    round_counts: bool = Query(False, description="Redondear conteo por bucket"),
    connected_only: bool = Query(True, description="Sólo contar bombas con heartbeats en la ventana"),
):
    """
    Serie de CANTIDAD DE BOMBAS ON por minuto (o bucketizada) en [from,to).
    - Si pasás pump_ids => NO se referencia public.pumps/public.locations (más robusto).
    - Si usás company_id/location_id => usa {PUMPS_TABLE}/{LOCATIONS_TABLE}.
    - Carry-forward (step hold) a minuto.
    - 'connected_only': si True, sólo bombas con heartbeats en la ventana.
    """
    df, dt = _bounds_utc_minute(date_from, date_to)
    ids = None
    if pump_ids:
        try:
            ids = [int(x.strip()) for x in pump_ids.split(",") if x.strip()]
        except Exception:
            raise HTTPException(status_code=400, detail="pump_ids inválido")

    try:
        with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
            # ---- 1) Scope de bombas (lista total del scope) ----
            if ids:
                scope_ids_all = ids
            else:
                if (company_id is not None) or (location_id is not None):
                    # Tipamos params para evitar "could not determine data type"
                    cur.execute(
                        f"""
                        WITH params AS (
                          SELECT
                            %(company_id)s::bigint AS company_id,
                            %(location_id)s::bigint AS location_id
                        )
                        SELECT p.id AS pump_id
                        FROM {PUMPS_TABLE} p
                        JOIN {LOCATIONS_TABLE} l ON l.id = p.location_id
                        CROSS JOIN params
                        WHERE (params.company_id IS NULL OR l.company_id = params.company_id)
                          AND (params.location_id IS NULL OR l.id = params.location_id)
                        """,
                        {"company_id": company_id, "location_id": location_id},
                    )
                    scope_ids_all = [int(r["pump_id"]) for r in cur.fetchall()]
                else:
                    # sin filtros: bombas con actividad ±48h alrededor de la ventana
                    cur.execute(
                        """
                        WITH bounds AS (
                          SELECT %(df)s::timestamptz AS start_utc, %(dt)s::timestamptz AS end_utc
                        )
                        SELECT DISTINCT h.pump_id
                        FROM kpi.pump_heartbeat_parsed h, bounds b
                        WHERE (h.hb_ts)::timestamptz >= (b.start_utc - interval '48 hours')
                          AND (h.hb_ts)::timestamptz <= b.end_utc
                        """,
                        {"df": df, "dt": dt},
                    )
                    scope_ids_all = [int(r["pump_id"]) for r in cur.fetchall()]

            pumps_total_all = len(scope_ids_all)
            if not pumps_total_all:
                return {
                    "timestamps": [],
                    "is_on": [],
                    "pumps_total": 0,
                    "pumps_connected": 0,
                    "window": {"from": df.isoformat(), "to": dt.isoformat()},
                }

            # ---- 2) Bombas conectadas en ventana (para connected_only y métrica) ----
            cur.execute(
                """
                SELECT DISTINCT h.pump_id
                FROM kpi.pump_heartbeat_parsed h
                JOIN (SELECT unnest(%(ids)s::int[]) AS pump_id) s ON s.pump_id = h.pump_id
                WHERE (h.hb_ts)::timestamptz >= %(df)s
                  AND (h.hb_ts)::timestamptz <= %(dt)s
                """,
                {"ids": scope_ids_all, "df": df, "dt": dt},
            )
            connected_set = {int(r["pump_id"]) for r in cur.fetchall()}
            scope_ids = scope_ids_all if not connected_only else [pid for pid in scope_ids_all if pid in connected_set]

            if not scope_ids:
                return {
                    "timestamps": [],
                    "is_on": [],
                    "pumps_total": pumps_total_all,
                    "pumps_connected": 0,
                    "window": {"from": df.isoformat(), "to": dt.isoformat()},
                }

            # ---- 3) Baseline por bomba (último estado antes de df) ----
            cur.execute(
                """
                SELECT DISTINCT ON (h.pump_id)
                       h.pump_id,
                       (h.relay)::boolean AS relay
                FROM kpi.pump_heartbeat_parsed h
                JOIN (SELECT unnest(%(ids)s::int[]) AS pump_id) s ON s.pump_id = h.pump_id
                WHERE (h.hb_ts)::timestamptz < %(df)s
                ORDER BY h.pump_id, (h.hb_ts)::timestamptz DESC
                """,
                {"ids": scope_ids, "df": df},
            )
            baseline_rows = cur.fetchall()
            baseline = {int(r["pump_id"]): bool(r["relay"]) for r in baseline_rows}

            # ---- 4) Heartbeats en [df, dt] (ordenados) ----
            cur.execute(
                """
                SELECT h.pump_id,
                       (h.hb_ts)::timestamptz AS ts,
                       (h.relay)::boolean     AS relay
                FROM kpi.pump_heartbeat_parsed h
                JOIN (SELECT unnest(%(ids)s::int[]) AS pump_id) s ON s.pump_id = h.pump_id
                WHERE (h.hb_ts)::timestamptz >= %(df)s
                  AND (h.hb_ts)::timestamptz <= %(dt)s
                ORDER BY h.pump_id, ts
                """,
                {"ids": scope_ids, "df": df, "dt": dt},
            )
            rows = cur.fetchall()

        # ---- 5) Carry-forward en Python → intervalos ON [start,end) por bomba ----
        from collections import defaultdict, OrderedDict

        by_pump: Dict[int, List[Dict[str, Any]]] = defaultdict(list)
        for r in rows:
            by_pump[int(r["pump_id"])].append({"ts": r["ts"], "relay": bool(r["relay"])})

        # eventos +1/-1 por minuto
        events: Dict[datetime, int] = defaultdict(int)

        for pid in scope_ids:
            state = bool(baseline.get(pid, False))      # estado vigente al inicio
            cur_start: Optional[datetime] = df if state else None

            for r in by_pump.get(pid, []):
                t: datetime = r["ts"]
                v: bool = r["relay"]
                if v == state:
                    continue
                if state is True:
                    # cerrar intervalo ON [cur_start, t)
                    inc = _ceil_minute(cur_start)
                    dec = _ceil_minute(t)
                    if inc < _ceil_minute(dt):
                        events[inc] += 1
                        events[dec] -= 1
                    cur_start = None
                else:
                    # abrir intervalo ON
                    cur_start = t
                state = v

            if state is True and cur_start is not None:
                inc = _ceil_minute(cur_start)
                dec = _ceil_minute(dt)
                if inc < _ceil_minute(dt):
                    events[inc] += 1
                    events[dec] -= 1

        # ---- 6) Grilla por minuto + prefix sum ----
        minutes: List[datetime] = []
        cur_m = df
        while cur_m <= dt:
            minutes.append(cur_m)
            cur_m += timedelta(minutes=1)

        run = 0
        evmap = OrderedDict(sorted(events.items()))
        out: List[int] = []
        ev_iter = iter(evmap.items())
        try:
            next_ev_time, next_ev_val = next(ev_iter)
        except StopIteration:
            next_ev_time, next_ev_val = None, 0

        for m in minutes:
            while next_ev_time is not None and next_ev_time <= m:
                run += next_ev_val
                try:
                    next_ev_time, next_ev_val = next(ev_iter)
                except StopIteration:
                    next_ev_time, next_ev_val = None, 0
            out.append(int(run))

        pumps_total = pumps_total_all
        pumps_connected = len(connected_set)

        # ---- 7) Bucketización de salida (1min|5min|15min|1h) ----
        bucket_min = _bucket_to_minutes(bucket)
        ts_ms, vals = _resample_minutes(minutes, out, bucket_min, mode=agg_mode, round_counts=round_counts)

        return {
            "timestamps": ts_ms,
            "is_on": vals,
            "pumps_total": pumps_total,
            "pumps_connected": pumps_connected,
            "window": {"from": df.isoformat(), "to": dt.isoformat()},
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"backend error: {e}")
