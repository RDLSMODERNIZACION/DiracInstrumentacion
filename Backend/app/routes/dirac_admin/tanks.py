from fastapi import APIRouter, Depends, HTTPException, Query, Response
from psycopg.rows import dict_row
from pydantic import BaseModel, field_validator
from typing import Optional, Dict, Any

from app.db import get_conn
from app.security import require_user
from .location_utils import ensure_location_id

router = APIRouter(prefix="/dirac/admin", tags=["admin-tanks"])

# -----------------------------
# Modelos
# -----------------------------

class TankCreate(BaseModel):
    name: str
    location_id: Optional[int] = None
    company_id: Optional[int] = None
    location_name: Optional[str] = None

    @field_validator("name")
    @classmethod
    def _name_trim(cls, v: str) -> str:
        v = (v or "").strip()
        if not v:
            raise ValueError("name requerido")
        return v

class TankPatch(BaseModel):
    name: Optional[str] = None
    location_id: Optional[int] = None
    company_id: Optional[int] = None
    location_name: Optional[str] = None

    @field_validator("name")
    @classmethod
    def _name_trim(cls, v: Optional[str]) -> Optional[str]:
        return (v or "").strip() if v is not None else v

# -----------------------------
# Helpers de permisos
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

def _tank_company_id(cur, tank_id: int) -> Optional[int]:
    """Obtiene company_id de un tanque vía su location."""
    cur.execute(
        """
        SELECT l.company_id
        FROM tanks t
        LEFT JOIN locations l ON l.id = t.location_id
        WHERE t.id=%s
        """,
        (tank_id,),
    )
    row = cur.fetchone()
    return row["company_id"] if row else None

def _location_company_id(cur, location_id: int) -> Optional[int]:
    cur.execute("SELECT company_id FROM locations WHERE id=%s", (location_id,))
    row = cur.fetchone()
    return row["company_id"] if row else None

def _count_refs(cur, tank_id: int) -> Dict[str, int]:
    """Cuenta referencias que bloquean borrado."""
    node_id = f"tank:{tank_id}"

    cur.execute("SELECT COUNT(*) AS c FROM public.layout_tanks WHERE tank_id=%s", (tank_id,))
    layout = int(cur.fetchone()["c"])

    cur.execute("SELECT COUNT(*) AS c FROM public.tank_configs WHERE tank_id=%s", (tank_id,))
    configs = int(cur.fetchone()["c"])

    cur.execute("SELECT COUNT(*) AS c FROM public.tank_ingest WHERE tank_id=%s", (tank_id,))
    ingest = int(cur.fetchone()["c"])

    cur.execute(
        "SELECT COUNT(*) AS c FROM public.layout_edges WHERE src_node_id=%s OR dst_node_id=%s",
        (node_id, node_id),
    )
    edges = int(cur.fetchone()["c"])

    return {"layout": layout, "configs": configs, "ingest": ingest, "edges": edges}

def _seed_layout_tank(cur, tank_id: int):
    """Crea fila de layout para el tanque si no existe (0,0), para que aparezca en el diagrama."""
    cur.execute(
        "INSERT INTO public.layout_tanks(tank_id, node_id, x, y) VALUES(%s, %s, 0, 0) ON CONFLICT (node_id) DO NOTHING",
        (tank_id, f"tank:{tank_id}"),
    )

# -----------------------------
# GET: listar con filtros (y sin 403 para viewers)
# -----------------------------

@router.get("/tanks", summary="Listar tanques (con filtros por empresa/ubicación)")
def list_tanks(
    company_id: Optional[int] = Query(None),
    location_id: Optional[int] = Query(None),
    user=Depends(require_user),
):
    """
    - Superadmin: lista todo (aplica filtros si vienen).
    - Resto: lista SOLO lo que puede ver (join a v_user_locations).
    """
    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        if _is_superadmin(user):
            q = """
            SELECT t.id, t.name, t.location_id
            FROM tanks t
            LEFT JOIN locations l ON l.id = t.location_id
            """
            conds, params = [], []
            if company_id is not None:
                conds.append("l.company_id = %s")
                params.append(company_id)
            if location_id is not None:
                conds.append("t.location_id = %s")
                params.append(location_id)
            if conds:
                q += " WHERE " + " AND ".join(conds)
            q += " ORDER BY t.id DESC"
            cur.execute(q, params)
            return cur.fetchall() or []

        # Usuario normal (viewer/operator/technician/admin de empresa):
        q = """
        SELECT t.id, t.name, t.location_id
        FROM tanks t
        JOIN v_user_locations v
          ON v.location_id = t.location_id
         AND v.user_id = %s
        """
        conds, params = [], [user["user_id"]]
        if company_id is not None:
            conds.append("v.company_id = %s")
            params.append(company_id)
        if location_id is not None:
            conds.append("t.location_id = %s")
            params.append(location_id)
        if conds:
            q += " WHERE " + " AND ".join(conds)
        q += " ORDER BY t.id DESC"
        cur.execute(q, params)
        return cur.fetchall() or []

# -----------------------------
# GET: referencias de un tanque (para UI de confirmación)
# -----------------------------

@router.get("/tanks/{tank_id}/refs", summary="Contar referencias que bloquean borrado")
def tank_refs(tank_id: int, user=Depends(require_user)):
    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        company_id = _tank_company_id(cur, tank_id)
        if company_id is None:
            raise HTTPException(404, "Tanque no encontrado")
        _assert_admin_company(cur, user, company_id)
        return _count_refs(cur, tank_id)

# -----------------------------
# POST: crear (owner/admin)
# -----------------------------

@router.post("/tanks", summary="Crear tanque (owner/admin)", status_code=201)
def create_tank(payload: TankCreate, user=Depends(require_user)):
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
            # Crear tanque
            cur.execute(
                "INSERT INTO tanks(name, location_id) VALUES(%s,%s) RETURNING id, name, location_id",
                (payload.name.strip(), loc_id),
            )
            row = cur.fetchone()
            # Semilla de layout para que aparezca en el diagrama
            _seed_layout_tank(cur, row["id"])
            conn.commit()
            return row
        except Exception as e:
            conn.rollback()
            raise HTTPException(400, f"Create tank error: {e}")

# -----------------------------
# PATCH: actualizar (owner/admin)
# -----------------------------

@router.patch("/tanks/{tank_id}", summary="Actualizar tanque (owner/admin)")
def update_tank(tank_id: int, payload: TankPatch, user=Depends(require_user)):
    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        # Estado actual
        cur.execute(
            """
            SELECT t.id, t.name, t.location_id, l.company_id
            FROM tanks t
            LEFT JOIN locations l ON l.id = t.location_id
            WHERE t.id=%s
            """,
            (tank_id,),
        )
        current = cur.fetchone()
        if not current:
            raise HTTPException(404, "Tanque no encontrado")

        # Resolver nueva ubicación (si corresponde) y empresa objetivo
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

        _assert_admin_company(cur, user, target_company_id)

        new_name = payload.name.strip() if (payload.name is not None) else None

        try:
            if new_name is None and loc_id is None:
                return {
                    "id": current["id"],
                    "name": current["name"],
                    "location_id": current["location_id"],
                }

            cur.execute(
                """
                UPDATE tanks
                   SET name = COALESCE(%s, name),
                       location_id = COALESCE(%s, location_id)
                 WHERE id = %s
                 RETURNING id, name, location_id
                """,
                (new_name, loc_id, tank_id),
            )
            row = cur.fetchone()
            conn.commit()
            return row or {}
        except Exception as e:
            conn.rollback()
            raise HTTPException(400, f"Update tank error: {e}")

# -----------------------------
# DELETE: eliminar (owner/admin) con cascada controlada
# -----------------------------

@router.delete("/tanks/{tank_id}", summary="Eliminar tanque (owner/admin)", status_code=204)
def delete_tank(tank_id: int, force: bool = Query(False), user=Depends(require_user)):
    """
    - Si tiene referencias y no se pasa ?force=true => 409 + detalle de counts.
    - Con ?force=true => elimina edges, layout, config e ingest antes de borrar el tanque.
    """
    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        company_id = _tank_company_id(cur, tank_id)
        if company_id is None:
            raise HTTPException(404, "Tanque no encontrado")
        _assert_admin_company(cur, user, company_id)

        counts = _count_refs(cur, tank_id)
        if not force and any(counts.values()):
            raise HTTPException(
                409,
                {"message": "El tanque tiene referencias. Reintenta con ?force=true", "counts": counts},
            )

        node_id = f"tank:{tank_id}"
        try:
            # Cascada controlada
            cur.execute("DELETE FROM public.layout_edges WHERE src_node_id=%s OR dst_node_id=%s", (node_id, node_id))
            cur.execute("DELETE FROM public.layout_tanks  WHERE tank_id=%s OR node_id=%s", (tank_id, node_id))
            cur.execute("DELETE FROM public.tank_configs  WHERE tank_id=%s", (tank_id,))
            cur.execute("DELETE FROM public.tank_ingest   WHERE tank_id=%s", (tank_id,))

            # Entidad
            cur.execute("DELETE FROM public.tanks WHERE id=%s", (tank_id,))
            if cur.rowcount == 0:
                raise HTTPException(404, "Tanque no encontrado")

            conn.commit()
            return Response(status_code=204)
        except HTTPException:
            conn.rollback()
            raise
        except Exception as e:
            conn.rollback()
            raise HTTPException(400, f"Delete tank error: {e}")
