# app/routes/kpi/tank_live.py
#
# Tanques LIVE (nivel):
# - Devuelve serie por minuto (o bucketizada) del NIVEL DE TANQUE promedio del scope en [from,to)
# - Filtros: empresa/ubicación o lista explícita de tank_ids
# - Agregación por minuto: avg | last (dentro del minuto)
# - Carry-forward (LOCF) opcional por minuto
# - Bucket de salida: 1min | 5min | 15min | 1h | 1d  (para ventanas largas, p.ej. 30 días)
# - connected_only: si True (default), sólo incluye tanques que tuvieron lecturas en la ventana
#
# Origen de datos: kpi.v_tank_levels_timeseries (tank_id, tank_name, level_pct, ts)
# Tablas de scope por defecto: public.tanks / public.locations (override por ENV)

import os
from fastapi import APIRouter, Query, HTTPException
from psycopg.rows import dict_row
from typing import Optional, Dict, Any, List, Tuple
from datetime import datetime, timedelta, timezone
from app.db import get_conn

router = APIRouter(prefix="/kpi/tanques", tags=["kpi-tanques-live"])

TANKS_TABLE = (os.getenv("TANKS_TABLE") or "public.tanks").strip()
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
    return {"1min": 1, "5min": 5, "15min": 15, "1h": 60, "1d": 1440}[b]

def _resample_minutes_avg(
    minutes: List[datetime],
    vals: List[Optional[float]],
    bucket_min: int,
) -> Tuple[List[int], List[Optional[float]]]:
    """Agrupa los valores por buckets de 'bucket_min' minutos aplicando promedio (ignorando None)."""
    if bucket_min <= 1:
        return [int(m.timestamp() * 1000) for m in minutes], vals

    out_ts: List[int] = []
    out_vals: List[Optional[float]] = []
    acc: List[float] = []
    start_idx = 0

    for i, v in enumerate(vals):
        if v is not None:
            acc.append(float(v))
        # cerramos bucket al completar N min o al final
        if ((i + 1) % bucket_min == 0) or (i == len(vals) - 1):
            out_ts.append(int(minutes[start_idx].timestamp() * 1000))  # timestamp al INICIO del bucket
            out_vals.append((sum(acc) / len(acc)) if acc else None)
            acc = []
            start_idx = i + 1

    return out_ts, out_vals

# ---------------- endpoint ----------------
@router.get("/live")
def tanks_live_24h(
    company_id: Optional[int] = Query(None, description="Scope por empresa"),
    location_id: Optional[int] = Query(None, description="Filtra por ubicación"),
    tank_ids: Optional[str] = Query(None, description="CSV opcional de tank_id(s)"),
    date_from: Optional[datetime] = Query(None, alias="from"),
    date_to:   Optional[datetime] = Query(None, alias="to"),
    agg: str = Query("avg", pattern="^(avg|last)$", description="Agregación dentro del minuto: avg|last"),
    carry: bool = Query(True, description="LOCF (step hold) por minuto"),
    connected_only: bool = Query(True, description="Sólo tanques con lecturas en la ventana"),
    # NUEVO: bucket de salida para ventanas largas
    bucket: str = Query("1min", pattern="^(1min|5min|15min|1h|1d)$", description="Resolución de salida"),
):
    """
    Serie por minuto (o bucketizada) del NIVEL de tanque(s) en [from,to).

    - Origen: kpi.v_tank_levels_timeseries (tank_id, tank_name, level_pct, ts)
    - Si hay múltiples tanques en el scope, devuelve el PROMEDIO por minuto (ignorando None).
    - 'agg' define cómo colapsar múltiples lecturas dentro de cada minuto (avg|last).
    - 'carry' aplica Last-Observation-Carried-Forward para minutos sin lecturas.
    - 'bucket' reagrupa la salida (1min, 5min, 15min, 1h, 1d) para 30 días, etc.
    """
    df, dt = _bounds_utc_minute(date_from, date_to)

    # parseo de ids explícitos
    ids = None
    if tank_ids:
        try:
            ids = [int(x.strip()) for x in tank_ids.split(",") if x.strip()]
        except Exception:
            raise HTTPException(status_code=400, detail="tank_ids inválido")

    try:
        with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:

            # ---- 1) Scope de tanques (lista total del scope) ----
            if ids:
                scope_ids_all = ids
            else:
                if company_id is not None or location_id is not None:
                    cur.execute(
                        f"""
                        WITH params AS (
                          SELECT
                            %(company_id)s::bigint AS company_id,
                            %(location_id)s::bigint AS location_id
                        )
                        SELECT t.id AS tank_id
                        FROM {TANKS_TABLE} t
                        JOIN {LOCATIONS_TABLE} l ON l.id = t.location_id
                        CROSS JOIN params
                        WHERE (params.company_id IS NULL OR l.company_id = params.company_id)
                          AND (params.location_id IS NULL OR l.id = params.location_id)
                        """,
                        {"company_id": company_id, "location_id": location_id},
                    )
                    scope_ids_all = [int(r["tank_id"]) for r in cur.fetchall()]
                else:
                    # sin filtros: tanques con actividad ±48h alrededor de la ventana
                    cur.execute(
                        """
                        WITH bounds AS (
                          SELECT %(df)s::timestamptz AS start_utc, %(dt)s::timestamptz AS end_utc
                        )
                        SELECT DISTINCT h.tank_id
                        FROM kpi.v_tank_levels_timeseries h, bounds b
                        WHERE (h.ts)::timestamptz >= (b.start_utc - interval '48 hours')
                          AND (h.ts)::timestamptz <= b.end_utc
                        """,
                        {"df": df, "dt": dt},
                    )
                    scope_ids_all = [int(r["tank_id"]) for r in cur.fetchall()]

            tanks_total_all = len(scope_ids_all)
            if not tanks_total_all:
                return {
                    "timestamps": [],
                    "level_percent": [],
                    "tanks_total": 0,
                    "tanks_connected": 0,
                    "window": {"from": df.isoformat(), "to": dt.isoformat()},
                }

            # ---- 2) Tanques conectados en ventana ----
            cur.execute(
                """
                SELECT DISTINCT h.tank_id
                FROM kpi.v_tank_levels_timeseries h
                JOIN (SELECT unnest(%(ids)s::int[]) AS tank_id) s ON s.tank_id = h.tank_id
                WHERE (h.ts)::timestamptz >= %(df)s
                  AND (h.ts)::timestamptz <= %(dt)s
                """,
                {"ids": scope_ids_all, "df": df, "dt": dt},
            )
            connected_set = {int(r["tank_id"]) for r in cur.fetchall()}
            scope_ids = scope_ids_all if not connected_only else [tid for tid in scope_ids_all if tid in connected_set]

            if not scope_ids:
                return {
                    "timestamps": [],
                    "level_percent": [],
                    "tanks_total": tanks_total_all,
                    "tanks_connected": 0,
                    "window": {"from": df.isoformat(), "to": dt.isoformat()},
                }

            # ---- 3) Baseline por tanque (último nivel antes de df) ----
            cur.execute(
                """
                SELECT DISTINCT ON (h.tank_id)
                       h.tank_id,
                       (h.level_pct)::float AS lvl
                FROM kpi.v_tank_levels_timeseries h
                JOIN (SELECT unnest(%(ids)s::int[]) AS tank_id) s ON s.tank_id = h.tank_id
                WHERE (h.ts)::timestamptz < %(df)s
                ORDER BY h.tank_id, (h.ts)::timestamptz DESC
                """,
                {"ids": scope_ids, "df": df},
            )
            baseline_rows = cur.fetchall()
            baseline = {int(r["tank_id"]): (None if r["lvl"] is None else float(r["lvl"])) for r in baseline_rows}

            # ---- 4) Lecturas por minuto en [df, dt] (agg=avg|last) ----
            if agg == "avg":
                agg_sql = "avg((h.level_pct)::float)::float"
            else:
                # 'last' dentro del minuto: valor más reciente del minuto
                agg_sql = "((array_agg((h.level_pct)::float ORDER BY (h.ts)::timestamptz DESC))[1])"

            cur.execute(
                f"""
                WITH mins AS (
                  SELECT date_trunc('minute', (h.ts)::timestamptz) AS m,
                         h.tank_id,
                         {agg_sql} AS val
                  FROM kpi.v_tank_levels_timeseries h
                  JOIN (SELECT unnest(%(ids)s::int[]) AS tank_id) s ON s.tank_id = h.tank_id
                  WHERE (h.ts)::timestamptz >= %(df)s
                    AND (h.ts)::timestamptz <= %(dt)s
                  GROUP BY h.tank_id, m
                )
                SELECT tank_id, m AS ts, val
                FROM mins
                ORDER BY tank_id, ts;
                """,
                {"ids": scope_ids, "df": df, "dt": dt},
            )
            rows = cur.fetchall()

        # ---- 5) Carry-forward por tanque y promedio por minuto (Python) ----
        from collections import defaultdict

        # Mapa: tank_id -> { minute_ts -> val }
        mm: Dict[int, Dict[datetime, float]] = defaultdict(dict)
        for r in rows:
            tid = int(r["tank_id"])
            t: datetime = r["ts"]
            v = None if r["val"] is None else float(r["val"])
            if v is not None:
                mm[tid][t] = v

        # Grilla de minutos
        minutes: List[datetime] = []
        cur_t = df
        while cur_t <= dt:
            minutes.append(cur_t)
            cur_t = cur_t + timedelta(minutes=1)

        # Serie por tanque con/sin carry
        per_tank_series: Dict[int, List[Optional[float]]] = {}
        for tid in scope_ids:
            series: List[Optional[float]] = []
            last = baseline.get(tid, None)
            for m in minutes:
                val = mm[tid].get(m, None)
                if val is not None:
                    last = val
                    series.append(val)
                else:
                    series.append(last if carry else None)
            per_tank_series[tid] = series

        # Promedio entre tanques por minuto (ignorando None)
        out_vals: List[Optional[float]] = []
        for i in range(len(minutes)):
            vals = [per_tank_series[tid][i] for tid in scope_ids]
            nums = [x for x in vals if x is not None]
            out_vals.append((sum(nums) / len(nums)) if nums else None)

        # ---- 6) Bucketización de salida (1min|5min|15min|1h|1d) ----
        bucket_min = _bucket_to_minutes(bucket)
        ts_ms, lv = _resample_minutes_avg(minutes, out_vals, bucket_min)

        # ---- 7) Respuesta final ----
        return {
            "timestamps": ts_ms,
            "level_percent": lv,
            "tanks_total": len(scope_ids_all),
            "tanks_connected": len(connected_set) if ids is None else len({int(r["tank_id"]) for r in rows}),
            "window": {"from": df.isoformat(), "to": dt.isoformat()},
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"backend error: {e}")
