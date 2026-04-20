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
    body = json.dumps(
        data,
        separators=(",", ":"),
        ensure_ascii=False,
        default=_jsonable,
    ).encode("utf-8")
    return hashlib.sha1(body).hexdigest()


@router.get("/config")
def list_pumps_config(request: Request, response: Response):
    now = time.time()

    cached = _PUMPS_CONFIG_CACHE["data"]
    if cached is not None and (now - _PUMPS_CONFIG_CACHE["ts"]) < _PUMPS_CONFIG_TTL_SECONDS:
        etag = _PUMPS_CONFIG_CACHE["etag"]
        response.headers["ETag"] = etag
        response.headers["Cache-Control"] = f"public, max-age={_PUMPS_CONFIG_TTL_SECONDS}"
        response.headers["X-Cache"] = "HIT"

        if request.headers.get("if-none-match") == etag:
            return Response(status_code=304, headers=dict(response.headers))

        return cached

    sql = """
    select
      p.id as pump_id,
      p.name,
      p.location_id,
      l.name as location_name,
      l.service_type as service_type,

      p.marca,
      p.modelo,
      p.numero_serie,
      p.anio_instalacion,
      p.tipo_bomba,
      p.caudal_nominal_m3h,
      p.altura_nominal_mca,
      p.potencia_kw,
      p.tension_v,
      p.tipo_arranque,
      p.criticidad,

      pc.state,
      pc.latest_event_id,
      pc.event_ts,
      pc.latest_hb_id,
      pc.hb_ts,
      pc.age_sec,
      pc.online
    from public.pumps p
    left join public.locations l on l.id = p.location_id
    left join public.v_pumps_config pc on pc.pump_id = p.id
    order by p.id
    """

    t0 = time.perf_counter()
    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        cur.execute(sql)
        rows = cur.fetchall()
    db_ms = int((time.perf_counter() - t0) * 1000)

    out = []
    for r in rows:
        st = r.get("service_type")
        st = "cloacas" if str(st or "").strip().lower() == "cloacas" else "agua"

        out.append(
            {
                "pump_id": r["pump_id"],
                "name": r.get("name"),
                "location_id": r.get("location_id"),
                "location_name": r.get("location_name"),
                "service_type": st,

                # estado operativo
                "state": r.get("state"),
                "latest_event_id": r.get("latest_event_id"),
                "event_ts": _jsonable(r.get("event_ts")),
                "latest_hb_id": r.get("latest_hb_id"),
                "hb_ts": _jsonable(r.get("hb_ts")),
                "age_sec": int(r["age_sec"]) if r.get("age_sec") is not None else None,
                "online": bool(r["online"]) if r.get("online") is not None else False,

                # ficha técnica
                "brand": r.get("marca"),
                "model": r.get("modelo"),
                "serial_number": r.get("numero_serie"),
                "install_year": int(r["anio_instalacion"]) if r.get("anio_instalacion") is not None else None,
                "pump_type": r.get("tipo_bomba"),
                "flow_nominal_m3h": float(r["caudal_nominal_m3h"]) if r.get("caudal_nominal_m3h") is not None else None,
                "head_nominal_mca": float(r["altura_nominal_mca"]) if r.get("altura_nominal_mca") is not None else None,
                "power_kw": float(r["potencia_kw"]) if r.get("potencia_kw") is not None else None,
                "voltage_v": float(r["tension_v"]) if r.get("tension_v") is not None else None,
                "start_type": r.get("tipo_arranque"),
                "criticality": r.get("criticidad"),
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