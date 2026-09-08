from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from psycopg.rows import dict_row

from app.db import get_conn
from app.security import require_user

router = APIRouter(prefix="/dirac/activity", tags=["activity"])


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


def _can_view_activity(user: dict) -> bool:
    if bool(user.get("superadmin")):
        return True
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT 1 FROM company_users WHERE user_id=%s AND role='owner'::membership_role_enum LIMIT 1",
            (user["user_id"],),
        )
        return cur.fetchone() is not None


@router.post("/session/start")
def start_session(payload: SessionStartIn, request: Request, user=Depends(require_user)):
    ip = _client_ip(request)
    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            """
            INSERT INTO app.user_sessions (
                user_id, device_type, browser, os, user_agent, ip,
                current_section, current_path
            )
            VALUES (%s, %s, %s, %s, %s, %s::inet, %s, %s)
            RETURNING id, started_at, last_seen_at
            """,
            (
                user["user_id"],
                payload.device_type,
                payload.browser,
                payload.os,
                payload.user_agent,
                ip,
                payload.current_section,
                payload.current_path,
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
    limit: int = Query(default=100, ge=1, le=500),
    user=Depends(require_user),
):
    if not _can_view_activity(user):
        raise HTTPException(403, "No autorizado para ver actividad de usuarios")

    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            """
            SELECT
                s.id,
                s.user_id,
                u.email,
                u.full_name,
                s.started_at,
                s.last_seen_at,
                s.ended_at,
                s.device_type,
                s.browser,
                s.os,
                host(s.ip) AS ip,
                s.city,
                s.region,
                s.country,
                s.current_section,
                s.current_path,
                ROUND(EXTRACT(EPOCH FROM (COALESCE(s.ended_at, s.last_seen_at) - s.started_at)) / 60.0, 1) AS duration_minutes,
                (s.ended_at IS NULL AND s.last_seen_at >= now() - interval '3 minutes') AS is_online
            FROM app.user_sessions s
            JOIN app_users u ON u.id = s.user_id
            ORDER BY s.started_at DESC
            LIMIT %s
            """,
            (limit,),
        )
        return cur.fetchall() or []
