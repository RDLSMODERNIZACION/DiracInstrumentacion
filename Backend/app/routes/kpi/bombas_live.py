# app/routes/kpi/bombas_live.py
import os
from fastapi import APIRouter, Query, HTTPException
from psycopg.rows import dict_row
from typing import Optional, Dict, Any, List
from datetime import datetime, timedelta, timezone
from app.db import get_conn

router = APIRouter(prefix="/kpi/bombas", tags=["kpi-bombas"])

# Opcional: para filtrar por empresa/ubicación (si querés esta rama)
PUMPS_TABLE = os.getenv("PUMPS_TABLE", "").strip()         # ej: public.pumps
LOCATIONS_TABLE = os.getenv("LOCATIONS_TABLE", "").strip() # ej: public.locations


# =========================
# Helpers
# =========================
def _bounds_24h(date_from: Optional[datetime], date_to: Optional[datetime]):
    """Ventana [from,to] en UTC, redondeada a minuto. Por defecto últimas 24h."""
    if date_to is None:
        date_to = datetime.now(timezone.utc)
    if date_from is None:
        date_from = date_to - timedelta(hours=24)

    if date_to.tzinfo is None:   date_to   = date_to.replace(tzinfo=timezone.utc)
    else:                        date_to   = date_to.astimezone(timezone.utc)
    if date_from.tzinfo is None: date_from = date_from.replace(tzinfo=timezone.utc)
    else:                        date_from = date_from.astimezone(timezone.utc)

    date_to   = date_to.replace(second=0, microsecond=0)
    date_from = date_from.replace(second=0, microsecond=0)
    return date_from, date_to


def _parse_ids(csv: Optional[str]) -> Optional[List[int]]:
    if not csv:
        return None
    out: List[int] = []
    for tok in csv.split(","):
        tok = tok.strip()
        if not tok:
            continue
        try:
            out.append(int(tok))
        except Exception:
            pass
    return out or None


# =========================
# Endpoint
# =========================
@router.get("/live")
def pumps_live_24h(
    company_id: Optional[int] = Query(None, description="Scope por empresa"),
    location_id: Optional[int] = Query(None, description="Filtra por ubicación"),
    pump_ids: Optional[str] = Query(None, description="CSV opcional de pump_id(s)"),
    date_from: Optional[datetime] = Query(None, alias="from", description="ISO8601"),
    date_to:   Optional[datetime] = Query(None, alias="to",   description="ISO8601"),
):
    """
    Serie por minuto con la CANTIDAD de bombas encendidas (carry-forward del estado).

    - Si pasás pump_ids (recomendado): NO se referencia pumps/locations.
    - Si no pasás pump_ids y usás company/location: configurá PUMPS_TABLE/LOCATIONS_TABLE.
    """
    df, dt = _bounds_24h(date_from, date_to)
    ids = _parse_ids(pump_ids)

    try:
        with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
            if ids:
                # === MODO A: por lista de bombas (sin tocar tablas externas) ===
                sql = """
                WITH
                  bounds AS (
                    SELECT %(df)s::timestamptz AS start_utc,
                           %(dt)s::timestamptz AS end_utc
                  ),
                  pump_scope AS (
                    -- Solo las bombas pedidas
                    SELECT DISTINCT h.pump_id
                    FROM kpi.pump_heartbeat_parsed h
                    WHERE h.pump_id = ANY(%(ids)s)
                  ),
                  grid AS (
                    SELECT generate_series(b.start_utc, b.end_utc, interval '1 minute') AS ts
                    FROM bounds b
                  ),
                  baseline AS (
                    SELECT s.pump_id,
                           (SELECT h.relay::boolean
                            FROM kpi.pump_heartbeat_parsed h, bounds b
                            WHERE h.pump_id = s.pump_id
                              AND h.hb_ts < b.start_utc
                            ORDER BY h.hb_ts DESC
                            LIMIT 1) AS relay_before
                    FROM pump_scope s
                  ),
                  changes AS (
                    SELECT h.pump_id,
                           h.hb_ts AS ts,
                           (h.relay::boolean) AS relay,
                           lag(h.relay::boolean) OVER (PARTITION BY h.pump_id ORDER BY h.hb_ts) AS prev
                    FROM kpi.pump_heartbeat_parsed h
                    JOIN pump_scope s ON s.pump_id = h.pump_id
                    JOIN bounds b ON TRUE
                    WHERE h.hb_ts <= b.end_utc
                      AND h.hb_ts >= (b.start_utc - interval '48 hours')
                  ),
                  edges AS (
                    SELECT pump_id, ts, relay
                    FROM changes
                    WHERE prev IS DISTINCT FROM relay
                  ),
                  timeline AS (
                    SELECT pump_id, ts, relay FROM edges
                    UNION ALL
                    SELECT s.pump_id, b.start_utc AS ts, COALESCE(bl.relay_before, false) AS relay
                    FROM pump_scope s
                    CROSS JOIN bounds b
                    LEFT JOIN baseline bl USING (pump_id)
                  ),
                  intervals AS (
                    SELECT
                      pump_id,
                      GREATEST(ts, b.start_utc) AS t_from,
                      LEAST(LEAD(ts, 1, b.end_utc) OVER (PARTITION BY pump_id ORDER BY ts), b.end_utc) AS t_to,
                      relay
                    FROM timeline, bounds b
                  ),
                  active AS (
                    SELECT pump_id, t_from, t_to
                    FROM intervals
                    WHERE relay = true AND t_to > t_from
                  ),
                  joined AS (
                    SELECT g.ts, COUNT(a.pump_id) AS on_count
                    FROM grid g
                    LEFT JOIN active a
                      ON a.t_from <= g.ts AND g.ts < a.t_to
                    GROUP BY g.ts
                    ORDER BY g.ts
                  ),
                  totals AS (
                    SELECT
                      (SELECT COUNT(*) FROM pump_scope) AS pumps_total,
                      (SELECT COUNT(DISTINCT h.pump_id)
                       FROM kpi.pump_heartbeat_parsed h, bounds b
                       JOIN pump_scope s ON s.pump_id = h.pump_id
                       WHERE h.hb_ts >= b.start_utc AND h.hb_ts <= b.end_utc) AS pumps_connected
                  )
                SELECT
                  extract(epoch FROM j.ts)::bigint * 1000 AS ts_ms,
                  j.on_count::int AS on_count,
                  t.pumps_total::int AS pumps_total,
                  t.pumps_connected::int AS pumps_connected
                FROM joined j
                CROSS JOIN totals t
                ORDER BY j.ts;
                """
                params: Dict[str, Any] = {"df": df, "dt": dt, "ids": ids}

            else:
                # === MODO B: por empresa/ubicación o TODOS ===
                if (company_id or location_id) and (not PUMPS_TABLE or not LOCATIONS_TABLE):
                    raise HTTPException(
                        status_code=400,
                        detail=(
                            "Para filtrar por company_id/location_id configurá PUMPS_TABLE y LOCATIONS_TABLE "
                            "(ej: PUMPS_TABLE=public.pumps, LOCATIONS_TABLE=public.locations) o pasá pump_ids."
                        ),
                    )

                if PUMPS_TABLE and LOCATIONS_TABLE:
                    sql = f"""
                    WITH
                      bounds AS (
                        SELECT %(df)s::timestamptz AS start_utc,
                               %(dt)s::timestamptz AS end_utc
                      ),
                      pump_scope AS (
                        SELECT p.id AS pump_id
                        FROM {PUMPS_TABLE} p
                        JOIN {LOCATIONS_TABLE} l ON l.id = p.location_id
                        WHERE (%(company_id)s IS NULL OR l.company_id = %(company_id)s)
                          AND (%(location_id)s IS NULL OR l.id = %(location_id)s)
                      ),
                      grid AS (
                        SELECT generate_series(b.start_utc, b.end_utc, interval '1 minute') AS ts
                        FROM bounds b
                      ),
                      baseline AS (
                        SELECT s.pump_id,
                               (SELECT h.relay::boolean
                                FROM kpi.pump_heartbeat_parsed h, bounds b
                                WHERE h.pump_id = s.pump_id
                                  AND h.hb_ts < b.start_utc
                                ORDER BY h.hb_ts DESC
                                LIMIT 1) AS relay_before
                        FROM pump_scope s
                      ),
                      changes AS (
                        SELECT h.pump_id,
                               h.hb_ts AS ts,
                               (h.relay::boolean) AS relay,
                               lag(h.relay::boolean) OVER (PARTITION BY h.pump_id ORDER BY h.hb_ts) AS prev
                        FROM kpi.pump_heartbeat_parsed h
                        JOIN pump_scope s ON s.pump_id = h.pump_id
                        JOIN bounds b ON TRUE
                        WHERE h.hb_ts <= b.end_utc
                          AND h.hb_ts >= (b.start_utc - interval '48 hours')
                      ),
                      edges AS (
                        SELECT pump_id, ts, relay FROM changes WHERE prev IS DISTINCT FROM relay
                      ),
                      timeline AS (
                        SELECT pump_id, ts, relay FROM edges
                        UNION ALL
                        SELECT s.pump_id, b.start_utc AS ts, COALESCE(bl.relay_before, false) AS relay
                        FROM pump_scope s
                        CROSS JOIN bounds b
                        LEFT JOIN baseline bl USING (pump_id)
                      ),
                      intervals AS (
                        SELECT
                          pump_id,
                          GREATEST(ts, b.start_utc) AS t_from,
                          LEAST(LEAD(ts, 1, b.end_utc) OVER (PARTITION BY pump_id ORDER BY ts), b.end_utc) AS t_to,
                          relay
                        FROM timeline, bounds b
                      ),
                      active AS (
                        SELECT pump_id, t_from, t_to
                        FROM intervals
                        WHERE relay = true AND t_to > t_from
                      ),
                      joined AS (
                        SELECT g.ts, COUNT(a.pump_id) AS on_count
                        FROM grid g
                        LEFT JOIN active a
                          ON a.t_from <= g.ts AND g.ts < a.t_to
                        GROUP BY g.ts
                        ORDER BY g.ts
                      ),
                      totals AS (
                        SELECT
                          (SELECT COUNT(*) FROM pump_scope) AS pumps_total,
                          (SELECT COUNT(DISTINCT h.pump_id)
                           FROM kpi.pump_heartbeat_parsed h, bounds b
                           JOIN pump_scope s ON s.pump_id = h.pump_id
                           WHERE h.hb_ts >= b.start_utc AND h.hb_ts <= b.end_utc) AS pumps_connected
                      )
                    SELECT
                      extract(epoch FROM j.ts)::bigint * 1000 AS ts_ms,
                      j.on_count::int AS on_count,
                      t.pumps_total::int AS pumps_total,
                      t.pumps_connected::int AS pumps_connected
                    FROM joined j
                    CROSS JOIN totals t
                    ORDER BY j.ts;
                    """
                    params = {"df": df, "dt": dt, "company_id": company_id, "location_id": location_id}
                else:
                    # TODOS los pump_id con actividad +/- 48h de la ventana
                    sql = """
                    WITH
                      bounds AS (
                        SELECT %(df)s::timestamptz AS start_utc,
                               %(dt)s::timestamptz AS end_utc
                      ),
                      pump_scope AS (
                        SELECT DISTINCT h.pump_id
                        FROM kpi.pump_heartbeat_parsed h, bounds b
                        WHERE h.hb_ts >= (b.start_utc - interval '48 hours')
                          AND h.hb_ts <= b.end_utc
                      ),
                      grid AS (
                        SELECT generate_series(b.start_utc, b.end_utc, interval '1 minute') AS ts
                        FROM bounds b
                      ),
                      baseline AS (
                        SELECT s.pump_id,
                               (SELECT h.relay::boolean
                                FROM kpi.pump_heartbeat_parsed h, bounds b
                                WHERE h.pump_id = s.pump_id
                                  AND h.hb_ts < b.start_utc
                                ORDER BY h.hb_ts DESC
                                LIMIT 1) AS relay_before
                        FROM pump_scope s
                      ),
                      changes AS (
                        SELECT h.pump_id,
                               h.hb_ts AS ts,
                               (h.relay::boolean) AS relay,
                               lag(h.relay::boolean) OVER (PARTITION BY h.pump_id ORDER BY h.hb_ts) AS prev
                        FROM kpi.pump_heartbeat_parsed h
                        JOIN pump_scope s ON s.pump_id = h.pump_id
                        JOIN bounds b ON TRUE
                        WHERE h.hb_ts <= b.end_utc
                          AND h.hb_ts >= (b.start_utc - interval '48 hours')
                      ),
                      edges AS (
                        SELECT pump_id, ts, relay FROM changes WHERE prev IS DISTINCT FROM relay
                      ),
                      timeline AS (
                        SELECT pump_id, ts, relay FROM edges
                        UNION ALL
                        SELECT s.pump_id, b.start_utc AS ts, COALESCE(bl.relay_before, false) AS relay
                        FROM pump_scope s
                        CROSS JOIN bounds b
                        LEFT JOIN baseline bl USING (pump_id)
                      ),
                      intervals AS (
                        SELECT
                          pump_id,
                          GREATEST(ts, b.start_utc) AS t_from,
                          LEAST(LEAD(ts, 1, b.end_utc) OVER (PARTITION BY pump_id ORDER BY ts), b.end_utc) AS t_to,
                          relay
                        FROM timeline, bounds b
                      ),
                      active AS (
                        SELECT pump_id, t_from, t_to
                        FROM intervals
                        WHERE relay = true AND t_to > t_from
                      ),
                      joined AS (
                        SELECT g.ts, COUNT(a.pump_id) AS on_count
                        FROM grid g
                        LEFT JOIN active a
                          ON a.t_from <= g.ts AND g.ts < a.t_to
                        GROUP BY g.ts
                        ORDER BY g.ts
                      ),
                      totals AS (
                        SELECT
                          (SELECT COUNT(*) FROM pump_scope) AS pumps_total,
                          (SELECT COUNT(DISTINCT h.pump_id)
                           FROM kpi.pump_heartbeat_parsed h, bounds b
                           JOIN pump_scope s ON s.pump_id = h.pump_id
                           WHERE h.hb_ts >= b.start_utc AND h.hb_ts <= b.end_utc) AS pumps_connected
                      )
                    SELECT
                      extract(epoch FROM j.ts)::bigint * 1000 AS ts_ms,
                      j.on_count::int AS on_count,
                      t.pumps_total::int AS pumps_total,
                      t.pumps_connected::int AS pumps_connected
                    FROM joined j
                    CROSS JOIN totals t
                    ORDER BY j.ts;
                    """
                    params = {"df": df, "dt": dt}

            cur.execute(sql, params)
            rows = cur.fetchall()

    except HTTPException:
        raise
    except Exception as e:
        # Exponer el detalle para depurar en Render / PowerShell
        raise HTTPException(status_code=500, detail=f"SQL error: {e}")

    return {
        "timestamps": [int(r["ts_ms"]) for r in rows],
        "is_on":      [int(r["on_count"]) for r in rows],
        "pumps_total": (int(rows[0]["pumps_total"]) if rows else 0),
        "pumps_connected": (int(rows[0]["pumps_connected"]) if rows else 0),
        "window": {"from": df.isoformat(), "to": dt.isoformat()},
    }
