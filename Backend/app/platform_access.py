"""Suspend interactive access while every application account is disabled.

The existing device integrations remain available. This operational lockout is
reversed by reactivating an account in Supabase; it does not replace the normal
per-user authorization checks.
"""

import logging

from fastapi import HTTPException, Request, status

from app.db import get_conn

logger = logging.getLogger(__name__)

# Match the resolved route template AND method, never a broad URL prefix.
# Several telemetry writers share a prefix with administration/read endpoints.
_DEVICE_ROUTES = frozenset({
    ("POST", "/ingest/tank"),
    # Preserve the narrow read path for integrations that may use remote levels.
    ("GET", "/ingest/tank/latest/{tank_id}"),
    ("POST", "/arduino-controler/heartbeat"),
    ("GET", "/arduino-controler/hb"),
    ("POST", "/arduino-controler/state"),
    ("GET", "/arduino-controler/st"),
    ("GET", "/arduino-controler/next_commands"),
    ("GET", "/plc/location_alarm/pending"),
    ("POST", "/plc/location_alarm/{command_id}/ack"),
    ("POST", "/components/network_analyzers/{analyzer_id}/snapshot"),
    ("POST", "/dirac/admin/manifolds/{manifold_id}/readings"),
    ("POST", "/dirac/admin/signals/{manifold_signal_id}/readings"),
    ("POST", "/mapa/distribucion/instrumentation/pressure/{meter_id}/readings"),
    ("POST", "/mapa/distribucion/instrumentation/flow/{meter_id}/readings"),
})

_HEALTH_ROUTES = frozenset({
    ("GET", "/"),
    ("HEAD", "/"),
    ("GET", "/health"),
    ("GET", "/health/db"),
})


def require_platform_access(request: Request) -> None:
    """FastAPI runs this synchronous dependency in its worker thread pool."""
    route = request.scope.get("route")
    route_path = getattr(route, "path", request.url.path)
    route_key = (request.method, route_path)
    if request.method == "OPTIONS" or route_key in _DEVICE_ROUTES or route_key in _HEALTH_ROUTES:
        return

    try:
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute(
                "SELECT EXISTS (SELECT 1 FROM public.app_users WHERE status = 'active')"
            )
            row = cur.fetchone()
            enabled = bool(row and row[0])
    except Exception:
        logger.exception("Could not verify platform access status")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="No se pudo verificar el acceso a la plataforma.",
            headers={"Cache-Control": "no-store"},
        ) from None

    if not enabled:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "platform_access_disabled",
                "message": "El acceso a la plataforma de instrumentación está deshabilitado.",
            },
            headers={"Cache-Control": "no-store"},
        )
