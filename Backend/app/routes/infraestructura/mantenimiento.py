from fastapi import APIRouter, HTTPException, Query, Request
from typing import Optional
from decimal import Decimal
from app.db import get_conn
from psycopg.rows import dict_row

router = APIRouter(prefix="/infraestructura", tags=["infraestructura-mantenimiento"])


# ============================================================
# Helpers
# ============================================================

VALID_MAINTENANCE_TYPES = {
    "preventivo",
    "correctivo",
    "inspeccion",
    "lubricacion",
    "limpieza",
    "cambio_repuesto",
}

VALID_STATUS = {
    "abierta",
    "planificada",
    "en_proceso",
    "resuelta",
    "cancelada",
}

VALID_PRIORITY = {
    "baja",
    "media",
    "alta",
    "critica",
}

VALID_PLAN_TYPES = {
    "dias",
    "horas_servicio",
    "manual",
}


def _normalize_text(v):
    if v is None:
        return None
    s = str(v).strip()
    return s if s else None


def _require_pump_exists(cur, pump_id: int):
    cur.execute(
        """
        SELECT id, name, location_id
        FROM public.pumps
        WHERE id = %s
        """,
        (pump_id,),
    )
    row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail=f"Bomba {pump_id} no encontrada")
    return row


def _parse_numeric_or_none(v, field_name: str):
    if v is None or v == "":
        return None
    try:
        return Decimal(str(v))
    except Exception:
        raise HTTPException(status_code=400, detail=f"{field_name} inválido")


def _parse_int_or_none(v, field_name: str):
    if v is None or v == "":
        return None
    try:
        return int(v)
    except Exception:
        raise HTTPException(status_code=400, detail=f"{field_name} inválido")


def _validate_order_payload(data: dict, partial: bool = False):
    out = {}

    if not partial or "maintenance_type" in data:
        maintenance_type = _normalize_text(data.get("maintenance_type"))
        if maintenance_type is None:
            raise HTTPException(status_code=400, detail="maintenance_type es requerido")
        if maintenance_type not in VALID_MAINTENANCE_TYPES:
            raise HTTPException(status_code=400, detail=f"maintenance_type inválido: {maintenance_type}")
        out["maintenance_type"] = maintenance_type

    if not partial or "status" in data:
        status = _normalize_text(data.get("status")) or "abierta"
        if status not in VALID_STATUS:
            raise HTTPException(status_code=400, detail=f"status inválido: {status}")
        out["status"] = status

    if not partial or "priority" in data:
        priority = _normalize_text(data.get("priority")) or "media"
        if priority not in VALID_PRIORITY:
            raise HTTPException(status_code=400, detail=f"priority inválido: {priority}")
        out["priority"] = priority

    if not partial or "title" in data:
        title = _normalize_text(data.get("title"))
        if title is None:
            raise HTTPException(status_code=400, detail="title es requerido")
        out["title"] = title

    for key in ["description", "diagnosis", "resolution"]:
        if not partial or key in data:
            out[key] = _normalize_text(data.get(key))

    for key in ["reported_at", "scheduled_for", "started_at", "completed_at"]:
        if not partial or key in data:
            out[key] = data.get(key)

    if not partial or "actual_cost" in data:
        out["actual_cost"] = _parse_numeric_or_none(data.get("actual_cost"), "actual_cost")

    if not partial or "downtime_days" in data:
        out["downtime_days"] = _parse_int_or_none(data.get("downtime_days"), "downtime_days")

    return out


def _validate_plan_payload(data: dict, partial: bool = False):
    out = {}

    if not partial or "name" in data:
        name = _normalize_text(data.get("name"))
        if name is None:
            raise HTTPException(status_code=400, detail="name es requerido")
        out["name"] = name

    if not partial or "description" in data:
        out["description"] = _normalize_text(data.get("description"))

    if not partial or "plan_type" in data:
        plan_type = _normalize_text(data.get("plan_type"))
        if plan_type is None:
            raise HTTPException(status_code=400, detail="plan_type es requerido")
        if plan_type not in VALID_PLAN_TYPES:
            raise HTTPException(status_code=400, detail=f"plan_type inválido: {plan_type}")
        out["plan_type"] = plan_type
    else:
        plan_type = None

    if not partial or "interval_days" in data:
        out["interval_days"] = _parse_int_or_none(data.get("interval_days"), "interval_days")

    if not partial or "interval_hours" in data:
        out["interval_hours"] = _parse_numeric_or_none(data.get("interval_hours"), "interval_hours")

    if not partial or "last_done_at" in data:
        out["last_done_at"] = data.get("last_done_at")

    if not partial or "next_due_at" in data:
        out["next_due_at"] = data.get("next_due_at")

    if not partial or "active" in data:
        active = data.get("active")
        if active is None:
            out["active"] = True
        elif isinstance(active, bool):
            out["active"] = active
        else:
            raise HTTPException(status_code=400, detail="active debe ser boolean")

    pt = out.get("plan_type", plan_type)
    if pt == "dias" and ("interval_days" in out) and out.get("interval_days") is None:
        raise HTTPException(status_code=400, detail="interval_days es requerido para plan_type='dias'")
    if pt == "horas_servicio" and ("interval_hours" in out) and out.get("interval_hours") is None:
        raise HTTPException(status_code=400, detail="interval_hours es requerido para plan_type='horas_servicio'")

    return out


# ============================================================
# Health / resumen por bomba
# ============================================================

@router.get("/pumps/{pump_id}/maintenance")
async def get_pump_maintenance(
    pump_id: int,
    limit: int = Query(default=50, ge=1, le=500),
):
    """
    Devuelve:
    - datos de la bomba
    - si está en mantenimiento ahora
    - orden actual (si existe)
    - historial de mantenimientos
    - último runtime conocido
    """
    try:
        with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
            pump = _require_pump_exists(cur, pump_id)

            cur.execute(
                """
                SELECT *
                FROM public.pump_maintenance_orders
                WHERE pump_id = %s
                ORDER BY
                  COALESCE(started_at, scheduled_for, reported_at, created_at) DESC,
                  id DESC
                LIMIT %s
                """,
                (pump_id, limit),
            )
            items = cur.fetchall()

            cur.execute(
                """
                SELECT *
                FROM public.pump_maintenance_orders
                WHERE pump_id = %s
                  AND status = 'en_proceso'
                ORDER BY COALESCE(started_at, reported_at, created_at) DESC, id DESC
                LIMIT 1
                """,
                (pump_id,),
            )
            current_order = cur.fetchone()

            cur.execute(
                """
                SELECT *
                FROM public.pump_runtime_history
                WHERE pump_id = %s
                ORDER BY measured_at DESC, id DESC
                LIMIT 1
                """,
                (pump_id,),
            )
            runtime = cur.fetchone()

            return {
                "ok": True,
                "pump": pump,
                "in_maintenance": current_order is not None,
                "current_order": current_order,
                "latest_runtime": runtime,
                "items": items,
            }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"DB error (get_pump_maintenance): {e}")


# ============================================================
# Crear orden de mantenimiento
# ============================================================

@router.post("/pumps/{pump_id}/maintenance")
async def create_pump_maintenance(pump_id: int, request: Request):
    """
    Inserta una orden de mantenimiento en pump_maintenance_orders.
    """
    data = await request.json()
    payload = _validate_order_payload(data, partial=False)

    try:
        with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
            pump = _require_pump_exists(cur, pump_id)

            cur.execute(
                """
                INSERT INTO public.pump_maintenance_orders (
                  pump_id,
                  maintenance_type,
                  status,
                  priority,
                  title,
                  description,
                  diagnosis,
                  resolution,
                  reported_at,
                  scheduled_for,
                  started_at,
                  completed_at,
                  actual_cost,
                  downtime_days,
                  created_at,
                  updated_at
                )
                VALUES (
                  %s, %s, %s, %s, %s, %s, %s, %s,
                  COALESCE(%s::timestamptz, now()),
                  %s::timestamptz,
                  %s::timestamptz,
                  %s::timestamptz,
                  %s,
                  %s,
                  now(),
                  now()
                )
                RETURNING *
                """,
                (
                    pump_id,
                    payload["maintenance_type"],
                    payload["status"],
                    payload["priority"],
                    payload["title"],
                    payload.get("description"),
                    payload.get("diagnosis"),
                    payload.get("resolution"),
                    payload.get("reported_at"),
                    payload.get("scheduled_for"),
                    payload.get("started_at"),
                    payload.get("completed_at"),
                    payload.get("actual_cost"),
                    payload.get("downtime_days"),
                ),
            )
            row = cur.fetchone()
            conn.commit()

            return {
                "ok": True,
                "pump": pump,
                "item": row,
            }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"DB error (create_pump_maintenance): {e}")


# ============================================================
# Actualizar orden
# ============================================================

@router.patch("/pumps/maintenance/{order_id}")
async def update_pump_maintenance(order_id: int, request: Request):
    """
    Actualiza una orden de mantenimiento existente.
    """
    data = await request.json()
    payload = _validate_order_payload(data, partial=True)

    fields = []
    values = []

    mapping = [
        ("maintenance_type", "maintenance_type"),
        ("status", "status"),
        ("priority", "priority"),
        ("title", "title"),
        ("description", "description"),
        ("diagnosis", "diagnosis"),
        ("resolution", "resolution"),
        ("reported_at", "reported_at"),
        ("scheduled_for", "scheduled_for"),
        ("started_at", "started_at"),
        ("completed_at", "completed_at"),
        ("actual_cost", "actual_cost"),
        ("downtime_days", "downtime_days"),
    ]

    for db_col, key in mapping:
        if key in payload:
            if db_col in {"reported_at", "scheduled_for", "started_at", "completed_at"}:
                fields.append(f"{db_col} = %s::timestamptz")
            else:
                fields.append(f"{db_col} = %s")
            values.append(payload[key])

    if not fields:
        raise HTTPException(status_code=400, detail="No hay campos para actualizar")

    fields.append("updated_at = now()")
    values.append(order_id)

    try:
        with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                f"""
                UPDATE public.pump_maintenance_orders
                SET {", ".join(fields)}
                WHERE id = %s
                RETURNING *
                """
            ,
                tuple(values),
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail=f"Orden {order_id} no encontrada")

            conn.commit()
            return {"ok": True, "item": row}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"DB error (update_pump_maintenance): {e}")


# ============================================================
# Listado simple por empresa o por estado
# ============================================================

@router.get("/maintenance/orders")
async def list_maintenance_orders(
    company_id: Optional[int] = Query(default=None),
    pump_id: Optional[int] = Query(default=None),
    status: Optional[str] = Query(default=None),
    limit: int = Query(default=200, ge=1, le=1000),
):
    """
    Lista órdenes de mantenimiento con filtros opcionales.
    """
    if status is not None and status not in VALID_STATUS:
        raise HTTPException(status_code=400, detail=f"status inválido: {status}")

    where = []
    params = []

    if pump_id is not None:
        where.append("pmo.pump_id = %s")
        params.append(pump_id)

    if status is not None:
        where.append("pmo.status = %s")
        params.append(status)

    if company_id is not None:
        where.append("l.company_id = %s")
        params.append(company_id)

    where_sql = f"WHERE {' AND '.join(where)}" if where else ""

    try:
        with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                f"""
                SELECT
                  pmo.*,
                  p.name AS pump_name,
                  p.location_id,
                  l.name AS location_name,
                  l.company_id
                FROM public.pump_maintenance_orders pmo
                JOIN public.pumps p ON p.id = pmo.pump_id
                LEFT JOIN public.locations l ON l.id = p.location_id
                {where_sql}
                ORDER BY COALESCE(pmo.started_at, pmo.scheduled_for, pmo.reported_at, pmo.created_at) DESC, pmo.id DESC
                LIMIT %s
                """,
                tuple(params + [limit]),
            )
            rows = cur.fetchall()
            return {"ok": True, "items": rows}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"DB error (list_maintenance_orders): {e}")


# ============================================================
# Planes de mantenimiento
# ============================================================

@router.get("/pumps/{pump_id}/maintenance/plans")
async def get_pump_maintenance_plans(pump_id: int):
    try:
        with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
            pump = _require_pump_exists(cur, pump_id)

            cur.execute(
                """
                SELECT *
                FROM public.pump_maintenance_plans
                WHERE pump_id = %s
                ORDER BY active DESC, next_due_at NULLS LAST, id DESC
                """,
                (pump_id,),
            )
            rows = cur.fetchall()

            return {
                "ok": True,
                "pump": pump,
                "items": rows,
            }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"DB error (get_pump_maintenance_plans): {e}")


@router.post("/pumps/{pump_id}/maintenance/plans")
async def create_pump_maintenance_plan(pump_id: int, request: Request):
    data = await request.json()
    payload = _validate_plan_payload(data, partial=False)

    try:
        with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
            pump = _require_pump_exists(cur, pump_id)

            cur.execute(
                """
                INSERT INTO public.pump_maintenance_plans (
                  pump_id,
                  name,
                  description,
                  plan_type,
                  interval_days,
                  interval_hours,
                  last_done_at,
                  next_due_at,
                  active,
                  created_at,
                  updated_at
                )
                VALUES (
                  %s, %s, %s, %s, %s, %s,
                  %s::timestamptz,
                  %s::timestamptz,
                  %s,
                  now(),
                  now()
                )
                RETURNING *
                """,
                (
                    pump_id,
                    payload["name"],
                    payload.get("description"),
                    payload["plan_type"],
                    payload.get("interval_days"),
                    payload.get("interval_hours"),
                    payload.get("last_done_at"),
                    payload.get("next_due_at"),
                    payload.get("active", True),
                ),
            )
            row = cur.fetchone()
            conn.commit()

            return {
                "ok": True,
                "pump": pump,
                "item": row,
            }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"DB error (create_pump_maintenance_plan): {e}")


@router.patch("/pumps/maintenance/plans/{plan_id}")
async def update_pump_maintenance_plan(plan_id: int, request: Request):
    data = await request.json()
    payload = _validate_plan_payload(data, partial=True)

    fields = []
    values = []

    mapping = [
        ("name", "name"),
        ("description", "description"),
        ("plan_type", "plan_type"),
        ("interval_days", "interval_days"),
        ("interval_hours", "interval_hours"),
        ("last_done_at", "last_done_at"),
        ("next_due_at", "next_due_at"),
        ("active", "active"),
    ]

    for db_col, key in mapping:
        if key in payload:
            if db_col in {"last_done_at", "next_due_at"}:
                fields.append(f"{db_col} = %s::timestamptz")
            else:
                fields.append(f"{db_col} = %s")
            values.append(payload[key])

    if not fields:
        raise HTTPException(status_code=400, detail="No hay campos para actualizar")

    fields.append("updated_at = now()")
    values.append(plan_id)

    try:
        with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                f"""
                UPDATE public.pump_maintenance_plans
                SET {", ".join(fields)}
                WHERE id = %s
                RETURNING *
                """,
                tuple(values),
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail=f"Plan {plan_id} no encontrado")

            conn.commit()
            return {"ok": True, "item": row}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"DB error (update_pump_maintenance_plan): {e}")


# ============================================================
# Runtime history
# ============================================================

@router.get("/pumps/{pump_id}/runtime")
async def get_pump_runtime_history(
    pump_id: int,
    limit: int = Query(default=100, ge=1, le=1000),
):
    try:
        with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
            pump = _require_pump_exists(cur, pump_id)

            cur.execute(
                """
                SELECT *
                FROM public.pump_runtime_history
                WHERE pump_id = %s
                ORDER BY measured_at DESC, id DESC
                LIMIT %s
                """,
                (pump_id, limit),
            )
            rows = cur.fetchall()

            return {
                "ok": True,
                "pump": pump,
                "items": rows,
            }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"DB error (get_pump_runtime_history): {e}")


@router.post("/pumps/{pump_id}/runtime")
async def create_pump_runtime_history(pump_id: int, request: Request):
    data = await request.json()
    runtime_hours_total = _parse_numeric_or_none(data.get("runtime_hours_total"), "runtime_hours_total")
    measured_at = data.get("measured_at")

    if runtime_hours_total is None:
        raise HTTPException(status_code=400, detail="runtime_hours_total es requerido")

    try:
        with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
            pump = _require_pump_exists(cur, pump_id)

            cur.execute(
                """
                INSERT INTO public.pump_runtime_history (
                  pump_id,
                  runtime_hours_total,
                  measured_at
                )
                VALUES (
                  %s,
                  %s,
                  COALESCE(%s::timestamptz, now())
                )
                RETURNING *
                """,
                (pump_id, runtime_hours_total, measured_at),
            )
            row = cur.fetchone()
            conn.commit()

            return {
                "ok": True,
                "pump": pump,
                "item": row,
            }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"DB error (create_pump_runtime_history): {e}")