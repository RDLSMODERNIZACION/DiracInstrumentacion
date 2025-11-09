# app/routes/dirac_admin/valves.py
from typing import Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from psycopg.rows import dict_row
from pydantic import BaseModel, field_validator

from app.db import get_conn
from app.security import require_user
from .location_utils import ensure_location_id

router = APIRouter(prefix="/dirac/admin", tags=["admin-valves"])

ALLOWED_KINDS = {"branch", "outlet", "isolation", "high", "gravity"}

# -----------------------------
# Modelos
# -----------------------------

class ValveCreate(BaseModel):
    name: str
    # Modalidad A: ubicación existente
    location_id: Optional[int] = None
    # Modalidad B: crear/usar ubicación por (empresa + nombre)
    company_id: Optional[int] = None
    location_name: Optional[str] = None
    # Otros
    kind: Optional[str] = None

    @field_validator("name")
    @classmethod
    def _name_trim(cls, v: str) -> str:
        v = (v or "").strip()
        if not v:
            raise ValueError("name requerido")
        return v

class ValvePatch(BaseModel):
    name: Optional[str] = None
    location_id: Optional[int] = None
    company_id: Optional[int] = None
    location_name: Optional[str] = None
    kind: Optional[str] = None

    @field_validator("name")
    @classmethod
    def _name_trim(cls, v: Optional[str]) -> Optional[str]:
        return (v or "").strip() if v is not None else v

# -----------------------------
# Helpers de permisos / utilitarios
# -----------------------------

def _is_superadmin(user: Dict[str, Any]) -> bool:
    try:
        return bool(user.get("superadmin"))
    except Exception:
        return False

def _assert_admin_company(cur, user: Dict[str, Any], company_id: Optional[int]):
    """Requiere owner/admin en la empresa (o superadmin)."""
    if company_id is None:
        raise HTTPException(400, "La ubicación debe pertenecer a una empresa")

    if _is_superadmin(user):
        return

    cur.execute(
        """
        SELECT 1
        FROM company_users
        WHERE user_id=%s AND company_id=%s AND role IN ('owner','admin')
        LIMIT 1
        """,
        (user["user_id"], company_id),
    )
    if not cur.fetchone():
        raise HTTPException(403, "Requiere owner/admin en la empresa")

def _location_company_id(cur, location_id: int) -> Optional[int]:
    cur.execute("SELECT company_id FROM locations WHERE id=%s", (location_id,))
    row = cur.fetchone()
    return row["company_id"] if row else None

def _valve_company_id(cur, valve_id: int) -> Optional[int]:
    cur.execute(
        """
        SELECT l.company_id
        FROM valves v
        LEFT JOIN locations l ON l.id = v.location_id
        WHERE v.id=%s
        """,
        (valve_id,),
    )
    row = cur.fetchone()
    return row["company_id"] if row else None

def _count_refs_valve(cur, valve_id: int) -> Dict[str, int]:
    """Cuenta referencias que bloquean el borrado."""
    node_id = f"valve:{valve_id}"
    cur.execute("SELECT COUNT(*) AS c FROM public.layout_valves WHERE valve_id=%s", (valve_id,))
    layout = int(cur.fetchone()["c"])
    cur.execute(
        "SELECT COUNT(*) AS c FROM public.layout_edges WHERE src_node_id=%s OR dst_node_id=%s",
        (node_id, node_id),
    )
    edges = int(cur.fetchone()["c"])
    return {"layout": layout, "edges": edges}

def _seed_layout_valve(cur, valve_id: int):
    """Crea fila de layout si no existe (0,0) para que aparezca en el diagrama."""
    cur.execute(
        """
        INSERT INTO public.layout_valves (valve_id, node_id, x, y)
        VALUES (%s, %s, 0, 0)
        ON CONFLICT (node_id) DO NOTHING
        """,
        (valve_id, f"valve:{valve_id}"),
    )

# -----------------------------
# GET: listar (viewer-safe) con filtros
# -----------------------------

@router.get("/valves", summary="Listar válvulas (con filtros por empresa/ubicación)")
def list_valves(
    company_id: Optional[int] = Query(None),
    location_id: Optional[int] = Query(None),
    kind: Optional[str] = Query(None),
    user=Depends(require_user),
):
    """
    - Superadmin: lista todo (aplica filtros si vienen).
    - Usuario normal (incluye viewer): lista SOLO lo que puede ver (JOIN v_user_locations).
    """
    kind_f = (kind or "").strip().lower() or None
    if kind_f is not None and kind_f not in ALLOWED_KINDS:
        raise HTTPException(400, f"kind inválido. Permitidos: {sorted(ALLOWED_KINDS)}")

    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        if _is_superadmin(user):
            q = """
            SELECT v.id, v.name, v.location_id, v.kind
            FROM valves v
            LEFT JOIN locations l ON l.id = v.location_id
            """
            conds, params = [], []
            if company_id is not None:
                conds.append("l.company_id = %s")
                params.append(company_id)
            if location_id is not None:
                conds.append("v.location_id = %s")
                params.append(location_id)
            if kind_f is not None:
                conds.append("v.kind = %s")
                params.append(kind_f)
            if conds:
                q += " WHERE " + " AND ".join(conds)
            q += " ORDER BY v.id DESC"
            cur.execute(q, params)
            return cur.fetchall() or []

        # Usuario normal: restringido a accesos efectivos
        q = """
        SELECT v.id, v.name, v.location_id, v.kind
        FROM valves v
        JOIN v_user_locations u
          ON u.location_id = v.location_id
         AND u.user_id = %s
        """
        conds, params = [], [user["user_id"]]
        if company_id is not None:
            conds.append("u.company_id = %s")
            params.append(company_id)
        if location_id is not None:
            conds.append("v.location_id = %s")
            params.append(location_id)
        if kind_f is not None:
            conds.append("v.kind = %s")
            params.append(kind_f)
        if conds:
            q += " WHERE " + " AND ".join(conds)
        q += " ORDER BY v.id DESC"
        cur.execute(q, params)
        return cur.fetchall() or []

# -----------------------------
# GET: referencias (para UI de confirmación)
# -----------------------------

@router.get("/valves/{valve_id}/refs", summary="Contar referencias de válvula")
def valve_refs(valve_id: int, user=Depends(require_user)):
    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        company_id = _valve_company_id(cur, valve_id)
        if company_id is None:
            raise HTTPException(404, "Válvula no encontrada")
        _assert_admin_company(cur, user, company_id)
        return _count_refs_valve(cur, valve_id)

# -----------------------------
# POST: crear (owner/admin)
# -----------------------------

@router.post("/valves", summary="Crear válvula (owner/admin)", status_code=201)
def create_valve(payload: ValveCreate, user=Depends(require_user)):
    kind = (payload.kind or "branch").strip().lower()
    if kind not in ALLOWED_KINDS:
        raise HTTPException(400, f"kind inválido. Permitidos: {sorted(ALLOWED_KINDS)}")

    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        # Determinar empresa objetivo y validar permisos
        target_company_id: Optional[int] = None
        if payload.location_id is not None:
            target_company_id = _location_company_id(cur, payload.location_id)
            if target_company_id is None:
                raise HTTPException(404, "Ubicación no encontrada")
        else:
            if not payload.company_id or not (payload.location_name or "").strip():
                raise HTTPException(400, "company_id y location_name son requeridos si no pasás location_id")
            target_company_id = payload.company_id

        _assert_admin_company(cur, user, target_company_id)

        # Resolver/crear location_id
        loc_id = ensure_location_id(
            conn,
            user["user_id"],
            payload.location_id,
            payload.company_id,
            (payload.location_name or "").strip() or None,
        )

        try:
            cur.execute(
                """
                INSERT INTO valves(name, location_id, kind)
                VALUES(%s, %s, %s)
                RETURNING id, name, location_id, kind
                """,
                ((payload.name or "").strip(), loc_id, kind),
            )
            row = cur.fetchone()
            # Semilla de layout para que aparezca en el diagrama
            _seed_layout_valve(cur, row["id"])
            conn.commit()
            return row
        except Exception as e:
            conn.rollback()
            raise HTTPException(400, f"Create valve error: {e}")

# -----------------------------
# PATCH: actualizar (owner/admin)
# -----------------------------

@router.patch("/valves/{valve_id}", summary="Actualizar válvula (owner/admin)")
def update_valve(valve_id: int, payload: ValvePatch, user=Depends(require_user)):
    new_kind = (payload.kind or "").strip().lower() if payload.kind is not None else None
    if new_kind is not None and new_kind not in ALLOWED_KINDS:
        raise HTTPException(400, f"kind inválido. Permitidos: {sorted(ALLOWED_KINDS)}")

    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        # Estado actual
        cur.execute(
            """
            SELECT v.id, v.name, v.location_id, v.kind, l.company_id
            FROM valves v
            LEFT JOIN locations l ON l.id = v.location_id
            WHERE v.id=%s
            """,
            (valve_id,),
        )
        current = cur.fetchone()
        if not current:
            raise HTTPException(404, "Válvula no encontrada")

        # Resolver cambio de ubicación (si corresponde) y empresa objetivo
        loc_id = None
        target_company_id = current["company_id"]

        wants_change_location = (
            payload.location_id is not None
            or (payload.company_id is not None and (payload.location_name or "").strip())
        )

        if wants_change_location:
            if payload.location_id is not None:
                loc_company_id = _location_company_id(cur, payload.location_id)
                if loc_company_id is None:
                    raise HTTPException(404, "Ubicación destino no encontrada")
                target_company_id = loc_company_id
                loc_id = payload.location_id
            else:
                if not payload.company_id or not (payload.location_name or "").strip():
                    raise HTTPException(400, "company_id y location_name requeridos para crear ubicación")
                target_company_id = payload.company_id
                loc_id = ensure_location_id(
                    conn,
                    user["user_id"],
                    None,
                    payload.company_id,
                    (payload.location_name or "").strip(),
                )

        # Permiso en la empresa objetivo
        _assert_admin_company(cur, user, target_company_id)

        new_name = (payload.name or "").strip() if (payload.name is not None) else None

        try:
            if new_name is None and loc_id is None and new_kind is None:
                # Nada para actualizar → devolvemos estado actual
                return {
                    "id": current["id"],
                    "name": current["name"],
                    "location_id": current["location_id"],
                    "kind": current["kind"],
                }

            cur.execute(
                """
                UPDATE valves
                   SET name        = COALESCE(%s, name),
                       location_id  = COALESCE(%s, location_id),
                       kind         = COALESCE(%s, kind)
                 WHERE id = %s
                 RETURNING id, name, location_id, kind
                """,
                (new_name, loc_id, new_kind, valve_id),
            )
            row = cur.fetchone()
            conn.commit()
            return row or {}
        except Exception as e:
            conn.rollback()
            raise HTTPException(400, f"Update valve error: {e}")

# -----------------------------
# DELETE: eliminar (owner/admin) con auto-cascada si es SOLO layout
# -----------------------------

@router.delete("/valves/{valve_id}", summary="Eliminar válvula (owner/admin)", status_code=204)
def delete_valve(valve_id: int, force: bool = Query(False), user=Depends(require_user)):
    """
    - Si solo existe layout => se borra sin pedir ?force.
    - Si hay otras refs (edges) y no se pasa ?force => 409 + counts.
    - Con ?force=true => cascada controlada.
    """
    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        company_id = _valve_company_id(cur, valve_id)
        if company_id is None:
            raise HTTPException(404, "Válvula no encontrada")
        _assert_admin_company(cur, user, company_id)

        counts = _count_refs_valve(cur, valve_id)
        layout_only = counts.get("layout", 0) > 0 and counts.get("edges", 0) == 0

        if not force and not layout_only and any(v > 0 for v in counts.values()):
            raise HTTPException(
                409,
                {"message": "La válvula tiene referencias. Reintenta con ?force=true", "counts": counts},
            )

        node_id = f"valve:{valve_id}"
        try:
            # Cascada controlada
            cur.execute("DELETE FROM public.layout_edges WHERE src_node_id=%s OR dst_node_id=%s", (node_id, node_id))
            cur.execute("DELETE FROM public.layout_valves WHERE valve_id=%s OR node_id=%s", (valve_id, node_id))

            cur.execute("DELETE FROM public.valves WHERE id=%s", (valve_id,))
            if cur.rowcount == 0:
                raise HTTPException(404, "Válvula no encontrada")

            conn.commit()
            return Response(status_code=204)
        except HTTPException:
            conn.rollback(); raise
        except Exception as e:
            conn.rollback(); raise HTTPException(400, f"Delete valve error: {e}")
