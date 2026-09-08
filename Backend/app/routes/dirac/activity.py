from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from psycopg.rows import dict_row

import ipaddress
import json
import time
import urllib.parse
import urllib.request

from app.db import get_conn
from app.security import require_user

router = APIRouter(prefix="/dirac/activity", tags=["activity"])

GEO_CACHE: dict[str, tuple[float, dict]] = {}
GEO_TTL_SEC = 7 * 24 * 3600
LOCAL_TZ = "America/Argentina/Buenos_Aires"


class SessionStartIn(BaseModel):
    device_type: str | None = None
    browser: str | None = None
    os: str | None = None
    user_agent: str | None = None
    current_section: str | None = None
    current_path: str | None = None


class SessionPingIn(BaseModel):
    session_id: int
    current_section: str | None = None
    current_path: str | None = None


def _client_ip(request: Request) -> str | None:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip() or None
    real_ip = request.headers.get("x-real-ip")
    if real_ip:
        return real_ip.strip() or None
    return request.client.host if request.client else None


def _is_public_ip(ip: str | None) -> bool:
    if not ip:
        return False
    try:
        obj = ipaddress.ip_address(ip)
        return not (obj.is_private or obj.is_loopback or obj.is_link_local or obj.is_multicast or obj.is_reserved)
    except ValueError:
        return False


def _geo_lookup(ip: str | None) -> dict:
    """Geolocalización aproximada por IP. Nunca se usa como GPS."""
    if not _is_public_ip(ip):
        return {}

    now = time.time()
    cached = GEO_CACHE.get(str(ip))
    if cached and now - cached[0] < GEO_TTL_SEC:
        return cached[1]

    result: dict = {}
    try:
        url = "https://ipwho.is/" + urllib.parse.quote(str(ip), safe="")
        req = urllib.request.Request(url, headers={"User-Agent": "DiracInstrumentacion/1.0"})
        with urllib.request.urlopen(req, timeout=2.5) as response:
            data = json.loads(response.read().decode("utf-8"))
        if data.get("success") is not False:
            result = {
                "city": data.get("city") or None,
                "region": data.get("region") or None,
                "country": data.get("country") or None,
            }
    except Exception:
        result = {}

    GEO_CACHE[str(ip)] = (now, result)
    return result


def _resolve_admin_company(cur, user: dict, requested_company_id: int | None) -> int:
    if requested_company_id is not None:
        cur.execute(
            """
            SELECT 1
            FROM company_users
            WHERE user_id=%s AND company_id=%s
              AND role IN ('owner','admin')
            LIMIT 1
            """,
            (user["user_id"], requested_company_id),
        )
        if not cur.fetchone():
            raise HTTPException(403, "No autorizado para ver actividad de esa empresa")
        return int(requested_company_id)

    cur.execute(
        """
        SELECT company_id
        FROM company_users
        WHERE user_id=%s AND role IN ('owner','admin')
        ORDER BY is_primary DESC, company_id ASC
        LIMIT 1
        """,
        (user["user_id"],),
    )
    row = cur.fetchone()
    if not row:
        raise HTTPException(403, "No autorizado para ver actividad de usuarios")
    return int(row["company_id"])


def _period_condition(period: str, alias: str = "s") -> str:
    p = (period or "30d").strip().lower()
    col = f"{alias}.started_at"
    if p == "today":
        return f"{col} >= (date_trunc('day', now() AT TIME ZONE '{LOCAL_TZ}') AT TIME ZONE '{LOCAL_TZ}')"
    if p == "7d":
        return f"{col} >= now() - interval '7 days'"
    if p == "month":
        return f"{col} >= (date_trunc('month', now() AT TIME ZONE '{LOCAL_TZ}') AT TIME ZONE '{LOCAL_TZ}')"
    if p == "prev_month":
        return (
            f"{col} >= ((date_trunc('month', now() AT TIME ZONE '{LOCAL_TZ}') - interval '1 month') AT TIME ZONE '{LOCAL_TZ}') "
            f"AND {col} < (date_trunc('month', now() AT TIME ZONE '{LOCAL_TZ}') AT TIME ZONE '{LOCAL_TZ}')"
        )
    return f"{col} >= now() - interval '30 days'"


@router.post("/session/start")
def start_session(payload: SessionStartIn, request: Request, user=Depends(require_user)):
    ip = _client_ip(request)
    geo = _geo_lookup(ip)
    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            """
            INSERT INTO app.user_sessions (
                user_id, device_type, browser, os, user_agent, ip,
                city, region, country, current_section, current_path
            )
            VALUES (%s, %s, %s, %s, %s, %s::inet, %s, %s, %s, %s, %s)
            RETURNING id, started_at, last_seen_at
            """,
            (
                user["user_id"], payload.device_type, payload.browser, payload.os,
                payload.user_agent, ip, geo.get("city"), geo.get("region"),
                geo.get("country"), payload.current_section, payload.current_path,
            ),
        )
        row = cur.fetchone()
        conn.commit()
        return row


@router.post("/session/heartbeat")
def heartbeat(payload: SessionPingIn, user=Depends(require_user)):
    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            """
            UPDATE app.user_sessions
               SET last_seen_at = now(),
                   current_section = COALESCE(%s, current_section),
                   current_path = COALESCE(%s, current_path)
             WHERE id=%s AND user_id=%s AND ended_at IS NULL
         RETURNING id, last_seen_at
            """,
            (payload.current_section, payload.current_path, payload.session_id, user["user_id"]),
        )
        row = cur.fetchone()
        conn.commit()
        if not row:
            raise HTTPException(404, "Sesión inexistente o finalizada")
        return row


@router.post("/session/end")
def end_session(payload: SessionPingIn, user=Depends(require_user)):
    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            """
            UPDATE app.user_sessions
               SET last_seen_at = now(), ended_at = now(),
                   current_section = COALESCE(%s, current_section),
                   current_path = COALESCE(%s, current_path)
             WHERE id=%s AND user_id=%s AND ended_at IS NULL
         RETURNING id, ended_at
            """,
            (payload.current_section, payload.current_path, payload.session_id, user["user_id"]),
        )
        row = cur.fetchone()
        conn.commit()
        return row or {"ok": True}


@router.get("/sessions")
def list_sessions(
    limit: int = Query(default=200, ge=1, le=500),
    company_id: int | None = Query(default=None),
    period: str = Query(default="30d"),
    user=Depends(require_user),
):
    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        target_company_id = _resolve_admin_company(cur, user, company_id)
        period_sql = _period_condition(period)
        cur.execute(
            f"""
            SELECT
                s.id, s.user_id, u.email, u.full_name,
                s.started_at, s.last_seen_at, s.ended_at,
                s.device_type, s.browser, s.os,
                host(s.ip) AS ip, s.city, s.region, s.country,
                s.current_section, s.current_path,
                ROUND(EXTRACT(EPOCH FROM (COALESCE(s.ended_at, s.last_seen_at) - s.started_at)) / 60.0, 1) AS duration_minutes,
                (s.ended_at IS NULL AND s.last_seen_at >= now() - interval '3 minutes') AS is_online
            FROM app.user_sessions s
            JOIN app_users u ON u.id = s.user_id
            WHERE EXISTS (
                SELECT 1 FROM company_users cu
                WHERE cu.user_id=s.user_id AND cu.company_id=%s
            )
              AND {period_sql}
            ORDER BY s.started_at DESC
            LIMIT %s
            """,
            (target_company_id, limit),
        )
        return cur.fetchall() or []


@router.get("/summary")
def activity_summary(
    company_id: int | None = Query(default=None),
    period: str = Query(default="30d"),
    user=Depends(require_user),
):
    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        target_company_id = _resolve_admin_company(cur, user, company_id)
        period_sql = _period_condition(period)
        company_filter = """
            EXISTS (
                SELECT 1 FROM company_users cu
                WHERE cu.user_id=s.user_id AND cu.company_id=%s
            )
        """

        cur.execute(
            f"""
            SELECT
              COUNT(*)::int AS sessions,
              COUNT(DISTINCT s.user_id)::int AS users,
              COUNT(*) FILTER (WHERE EXTRACT(EPOCH FROM (COALESCE(s.ended_at,s.last_seen_at)-s.started_at)) >= 60)::int AS significant_sessions,
              ROUND(COALESCE(SUM(EXTRACT(EPOCH FROM (COALESCE(s.ended_at,s.last_seen_at)-s.started_at))),0)/60.0,1) AS total_minutes,
              ROUND(COALESCE(AVG(EXTRACT(EPOCH FROM (COALESCE(s.ended_at,s.last_seen_at)-s.started_at))),0)/60.0,1) AS avg_minutes,
              COUNT(*) FILTER (WHERE s.device_type IN ('mobile','tablet'))::int AS mobile_sessions
            FROM app.user_sessions s
            WHERE {company_filter} AND {period_sql}
            """,
            (target_company_id,),
        )
        kpis = cur.fetchone() or {}

        cur.execute(
            """
            SELECT COUNT(DISTINCT s.user_id)::int AS online
            FROM app.user_sessions s
            WHERE s.ended_at IS NULL
              AND s.last_seen_at >= now() - interval '3 minutes'
              AND EXISTS (
                SELECT 1 FROM company_users cu
                WHERE cu.user_id=s.user_id AND cu.company_id=%s
              )
            """,
            (target_company_id,),
        )
        online = int((cur.fetchone() or {}).get("online") or 0)

        cur.execute(
            f"""
            SELECT
              (s.started_at AT TIME ZONE '{LOCAL_TZ}')::date AS day,
              COUNT(*)::int AS sessions,
              COUNT(DISTINCT s.user_id)::int AS users,
              ROUND(SUM(EXTRACT(EPOCH FROM (COALESCE(s.ended_at,s.last_seen_at)-s.started_at)))/60.0,1) AS minutes
            FROM app.user_sessions s
            WHERE {company_filter} AND {period_sql}
            GROUP BY 1 ORDER BY 1
            """,
            (target_company_id,),
        )
        daily = cur.fetchall() or []

        cur.execute(
            f"""
            SELECT
              s.user_id, u.email, u.full_name,
              COUNT(*)::int AS sessions,
              ROUND(SUM(EXTRACT(EPOCH FROM (COALESCE(s.ended_at,s.last_seen_at)-s.started_at)))/60.0,1) AS minutes,
              MAX(s.last_seen_at) AS last_seen_at
            FROM app.user_sessions s
            JOIN app_users u ON u.id=s.user_id
            WHERE {company_filter} AND {period_sql}
            GROUP BY s.user_id, u.email, u.full_name
            ORDER BY minutes DESC, sessions DESC
            LIMIT 10
            """,
            (target_company_id,),
        )
        ranking = cur.fetchall() or []

        total_sessions = int(kpis.get("sessions") or 0)
        mobile_sessions = int(kpis.get("mobile_sessions") or 0)
        mobile_pct = round((mobile_sessions * 100.0 / total_sessions), 1) if total_sessions else 0.0

        return {
            "company_id": target_company_id,
            "period": period,
            "kpis": {
                "online": online,
                "users": int(kpis.get("users") or 0),
                "sessions": total_sessions,
                "significant_sessions": int(kpis.get("significant_sessions") or 0),
                "total_minutes": float(kpis.get("total_minutes") or 0),
                "avg_minutes": float(kpis.get("avg_minutes") or 0),
                "mobile_pct": mobile_pct,
            },
            "daily": daily,
            "ranking": ranking,
        }


@router.post("/geo/backfill")
def backfill_geo(
    company_id: int | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=50),
    user=Depends(require_user),
):
    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        target_company_id = _resolve_admin_company(cur, user, company_id)
        cur.execute(
            """
            SELECT DISTINCT host(s.ip) AS ip
            FROM app.user_sessions s
            WHERE s.ip IS NOT NULL
              AND (s.city IS NULL OR s.region IS NULL OR s.country IS NULL)
              AND EXISTS (
                SELECT 1 FROM company_users cu
                WHERE cu.user_id=s.user_id AND cu.company_id=%s
              )
            ORDER BY ip
            LIMIT %s
            """,
            (target_company_id, limit),
        )
        ips = [r["ip"] for r in (cur.fetchall() or []) if r.get("ip")]

        updated = 0
        for ip in ips:
            geo = _geo_lookup(ip)
            if not geo:
                continue
            cur.execute(
                """
                UPDATE app.user_sessions s
                   SET city=COALESCE(city,%s), region=COALESCE(region,%s), country=COALESCE(country,%s)
                 WHERE host(s.ip)=%s
                   AND EXISTS (
                     SELECT 1 FROM company_users cu
                     WHERE cu.user_id=s.user_id AND cu.company_id=%s
                   )
                """,
                (geo.get("city"), geo.get("region"), geo.get("country"), ip, target_company_id),
            )
            updated += cur.rowcount or 0
        conn.commit()
        return {"ok": True, "ips_checked": len(ips), "rows_updated": updated}
