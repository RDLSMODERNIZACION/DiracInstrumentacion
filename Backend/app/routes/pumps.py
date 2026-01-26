# app/routes/pumps.py
import json
import time
import hashlib
from fastapi import APIRouter, Request, Response
from app.db import get_conn
from psycopg.rows import dict_row

router = APIRouter(prefix="/pumps", tags=["pumps"])

# Cache en memoria (RAM) para bajar de ~3s a ~<200ms en requests repetidas
_PUMPS_CONFIG_CACHE = {
    "ts": 0.0,        # timestamp del último refresh
    "data": None,     # lista (output)
    "etag": None,     # hash del body para 304
}
_PUMPS_CONFIG_TTL_SECONDS = 10  # ajustá: 5 si querés más “live”, 15 si querés menos carga


def _compute_etag(data) -> str:
    # etag estable: hash del JSON compacto
    body = json.dumps(data, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    return hashlib.sha1(body).hexdigest()


@router.get("/config")
def list_pumps_config(request: Request, response: Response):
    """
    Devuelve bombas con estado (run/stop) y conectividad (online/age_sec)
    leyendo de public.v_pumps_with_status.

    Optimización:
      - Cache RAM con TTL corto (default 10s)
      - ETag + 304 si el cliente ya tiene la misma versión
      - Cache-Control para permitir cache en navegador/proxies
    """
    now = time.time()

    # 1) Servir desde cache si está vigente
    cached = _PUMPS_CONFIG_CACHE["data"]
    if cached is not None and (now - _PUMPS_CONFIG_CACHE["ts"]) < _PUMPS_CONFIG_TTL_SECONDS:
        etag = _PUMPS_CONFIG_CACHE["etag"]
        response.headers["ETag"] = etag
        response.headers["Cache-Control"] = f"public, max-age={_PUMPS_CONFIG_TTL_SECONDS}"
        response.headers["X-Cache"] = "HIT"

        if request.headers.get("if-none-match") == etag:
            return Response(status_code=304, headers=dict(response.headers))

        return cached

    # 2) Cache vencido: refrescar desde DB
    sql = """
    SELECT
      pump_id,
      name,
      location_id,
      location_name,

      -- estado del relé (último pump_events)
      state,
      latest_event_id,
      event_ts,

      -- conectividad (último pump_heartbeat)
      latest_hb_id,
      hb_ts,
      age_sec,
      online
    FROM public.v_pumps_with_status
    ORDER BY pump_id
    """

    t0 = time.perf_counter()
    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        cur.execute(sql)
        rows = cur.fetchall()
    db_ms = int((time.perf_counter() - t0) * 1000)

    out = []
    for r in rows:
        out.append(
            {
                "pump_id": r["pump_id"],
                "name": r["name"],
                "location_id": r["location_id"],
                "location_name": r["location_name"],

                # estado relé
                "state": r.get("state") or "stop",
                "latest_event_id": r.get("latest_event_id"),
                "event_ts": r.get("event_ts"),

                # heartbeat / conectividad
                "latest_hb_id": r.get("latest_hb_id"),
                "hb_ts": r.get("hb_ts"),
                "age_sec": int(r["age_sec"]) if r.get("age_sec") is not None else None,
                "online": bool(r["online"]) if r.get("online") is not None else False,
            }
        )

    etag = _compute_etag(out)
    _PUMPS_CONFIG_CACHE.update({"ts": now, "data": out, "etag": etag})

    response.headers["ETag"] = etag
    response.headers["Cache-Control"] = f"public, max-age={_PUMPS_CONFIG_TTL_SECONDS}"
    response.headers["X-Cache"] = "MISS"
    response.headers["X-DB-MS"] = str(db_ms)

    # 3) Si el cliente ya lo tiene, devolvemos 304 (aun siendo MISS)
    if request.headers.get("if-none-match") == etag:
        return Response(status_code=304, headers=dict(response.headers))

    return out
