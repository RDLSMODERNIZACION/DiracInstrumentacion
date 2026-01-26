# app/routes/pumps.py
import json
import time
import hashlib
from datetime import datetime, date
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Request, Response
from app.db import get_conn
from psycopg.rows import dict_row

router = APIRouter(prefix="/pumps", tags=["pumps"])

_PUMPS_CONFIG_CACHE = {"ts": 0.0, "data": None, "etag": None}
_PUMPS_CONFIG_TTL_SECONDS = 10


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


def _compute_etag(data) -> str:
    # Aseguramos json 100% serializable
    body = json.dumps(
        data,
        separators=(",", ":"),
        ensure_ascii=False,
        default=_jsonable,   # ✅ clave: serializa datetime/Decimal/UUID
    ).encode("utf-8")
    return hashlib.sha1(body).hexdigest()


@router.get("/config")
def list_pumps_config(request: Request, response: Response):
    now = time.time()

    # 1) cache HIT
    cached = _PUMPS_CONFIG_CACHE["data"]
    if cached is not None and (now - _PUMPS_CONFIG_CACHE["ts"]) < _PUMPS_CONFIG_TTL_SECONDS:
        etag = _PUMPS_CONFIG_CACHE["etag"]
        response.headers["ETag"] = etag
        response.headers["Cache-Control"] = f"public, max-age={_PUMPS_CONFIG_TTL_SECONDS}"
        response.headers["X-Cache"] = "HIT"

        if request.headers.get("if-none-match") == etag:
            return Response(status_code=304, headers=dict(response.headers))

        return cached

    # 2) cache MISS => DB
    sql = """
    SELECT
      pump_id,
      name,
      location_id,
      location_name,
      state,
      latest_event_id,
      event_ts,
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

                "state": r.get("state") or "stop",
                "latest_event_id": _jsonable(r.get("latest_event_id")),
                "event_ts": _jsonable(r.get("event_ts")),   # ✅ isoformat

                "latest_hb_id": _jsonable(r.get("latest_hb_id")),
                "hb_ts": _jsonable(r.get("hb_ts")),         # ✅ isoformat
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

    if request.headers.get("if-none-match") == etag:
        return Response(status_code=304, headers=dict(response.headers))

    return out
