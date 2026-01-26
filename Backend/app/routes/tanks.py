# app/routes/tanks.py
import json
import time
import hashlib
from datetime import datetime, date
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Request, Response
from app.db import get_conn
from psycopg.rows import dict_row

router = APIRouter(prefix="/tanks", tags=["tanks"])

# Cache RAM (como pumps)
_TANKS_CONFIG_CACHE = {"ts": 0.0, "data": None, "etag": None}
_TANKS_CONFIG_TTL_SECONDS = 10  # subilo a 30/60 si querés


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
    body = json.dumps(
        data,
        separators=(",", ":"),
        ensure_ascii=False,
        default=_jsonable,
    ).encode("utf-8")
    return hashlib.sha1(body).hexdigest()


def compute_alarm(level_pct, low_low, low, high, high_high):
    """Devuelve 'normal' | 'alerta' | 'critico'."""
    if level_pct is None:
        return "normal"
    # defaults por si faltan en la fila
    low_low = float(low_low) if low_low is not None else 10.0
    low = float(low) if low is not None else 25.0
    high = float(high) if high is not None else 80.0
    high_high = float(high_high) if high_high is not None else 90.0
    x = float(level_pct)
    if x <= low_low or x >= high_high:
        return "critico"
    if x <= low or x >= high:
        return "alerta"
    return "normal"


@router.get("/config")
def list_tanks_config(request: Request, response: Response):
    now = time.time()

    # 1) Cache HIT
    cached = _TANKS_CONFIG_CACHE["data"]
    if cached is not None and (now - _TANKS_CONFIG_CACHE["ts"]) < _TANKS_CONFIG_TTL_SECONDS:
        etag = _TANKS_CONFIG_CACHE["etag"]
        response.headers["ETag"] = etag
        response.headers["Cache-Control"] = f"public, max-age={_TANKS_CONFIG_TTL_SECONDS}"
        response.headers["X-Cache"] = "HIT"

        if request.headers.get("if-none-match") == etag:
            return Response(status_code=304, headers=dict(response.headers))

        return cached

    # 2) Cache MISS => DB
    sql = """
    select
      tank_id,
      name,
      location_id,
      location_name,
      low_pct,
      low_low_pct,
      high_pct,
      high_high_pct,
      updated_by,
      updated_at,
      level_pct,        -- último nivel (de v_tank_latest)
      age_sec,          -- antigüedad de la última lectura (segundos)
      online,           -- true/false según umbral
      alarma            -- (puede venir NULL si la vista aún no la tiene)
    from public.v_tanks_with_config
    order by tank_id
    """

    t0 = time.perf_counter()
    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        cur.execute(sql)
        rows = cur.fetchall()
    db_ms = int((time.perf_counter() - t0) * 1000)

    out = []
    for r in rows:
        alarm_txt = r.get("alarma")
        if alarm_txt is None:
            alarm_txt = compute_alarm(
                r.get("level_pct"),
                r.get("low_low_pct"),
                r.get("low_pct"),
                r.get("high_pct"),
                r.get("high_high_pct"),
            )

        out.append(
            {
                "tank_id": r["tank_id"],
                "name": r.get("name"),
                "location_id": r.get("location_id"),
                "location_name": r.get("location_name"),

                "low_pct": float(r["low_pct"]) if r.get("low_pct") is not None else None,
                "low_low_pct": float(r["low_low_pct"]) if r.get("low_low_pct") is not None else None,
                "high_pct": float(r["high_pct"]) if r.get("high_pct") is not None else None,
                "high_high_pct": float(r["high_high_pct"]) if r.get("high_high_pct") is not None else None,

                "updated_by": _jsonable(r.get("updated_by")),
                "updated_at": _jsonable(r.get("updated_at")),  # ✅ datetime -> iso

                "level_pct": float(r["level_pct"]) if r.get("level_pct") is not None else None,
                "age_sec": int(r["age_sec"]) if r.get("age_sec") is not None else None,
                "online": bool(r["online"]) if r.get("online") is not None else False,

                "alarma": str(alarm_txt),
            }
        )

    etag = _compute_etag(out)
    _TANKS_CONFIG_CACHE.update({"ts": now, "data": out, "etag": etag})

    response.headers["ETag"] = etag
    response.headers["Cache-Control"] = f"public, max-age={_TANKS_CONFIG_TTL_SECONDS}"
    response.headers["X-Cache"] = "MISS"
    response.headers["X-DB-MS"] = str(db_ms)

    if request.headers.get("if-none-match") == etag:
        return Response(status_code=304, headers=dict(response.headers))

    return out
