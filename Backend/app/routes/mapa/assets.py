# app/routes/mapa/assets.py
from __future__ import annotations

import json
from typing import Any, Dict, Literal, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from app.db import get_conn


router = APIRouter(prefix="/assets", tags=["mapa"])


AssetType = Literal[
    "TANK",
    "PUMP",
    "MANIFOLD",
    "VALVE",
    "PRESSURE_SENSOR",
    "FLOW_SENSOR",
    "LEVEL_SENSOR",
    "WELL",
    "SECTOR",
    "OTHER",
]

SimRole = Literal[
    "SOURCE_HEAD",
    "ACTUATOR",
    "MEASURE_POINT",
    "BLOCK",
    "DEMAND",
    "INFO",
]


class AssetLinkBody(BaseModel):
    """
    Body para ubicar/desubicar un activo real en el mapa.

    Reglas:
    - Para ubicar en nodo: mandar map_node_id.
    - Para ubicar en cañería: mandar map_pipe_id.
    - No mandar ambos a la vez.
    - Para desubicar: mandar clear=true.
    """

    map_node_id: Optional[str] = None
    map_pipe_id: Optional[str] = None
    clear: bool = False

    hydraulic_position: Optional[str] = None
    enabled: Optional[bool] = None
    priority: Optional[int] = Field(default=None, ge=0, le=10000)

    props: Optional[Dict[str, Any]] = None
    notes: Optional[str] = None


class AssetUpdateBody(BaseModel):
    """
    Body para cambios generales del activo.
    No se usa para valores vivos; esos salen de v_map_assets_live.
    """

    asset_name: Optional[str] = None
    sim_role: Optional[SimRole] = None
    hydraulic_position: Optional[str] = None
    enabled: Optional[bool] = None
    priority: Optional[int] = Field(default=None, ge=0, le=10000)
    props: Optional[Dict[str, Any]] = None
    notes: Optional[str] = None


def _fetchall_dict(cur):
    cols = [d[0] for d in cur.description]
    return [dict(zip(cols, row)) for row in cur.fetchall()]


def _fetchone_dict(cur):
    row = cur.fetchone()
    if not row:
        return None

    cols = [d[0] for d in cur.description]
    return dict(zip(cols, row))


def _asset_select_sql(where: str = "", order_limit: str = "") -> str:
    return f"""
        SELECT
            asset_link_id::text AS asset_link_id,
            asset_type,
            asset_id,
            asset_name,
            source_table,
            location_id,
            sim_role,
            hydraulic_position,
            map_node_id::text AS map_node_id,
            map_pipe_id::text AS map_pipe_id,
            linked_to_map,
            level_pct::double precision AS level_pct,
            pressure_bar::double precision AS pressure_bar,
            flow_lps::double precision AS flow_lps,
            run_status,
            online,
            age_sec::double precision AS age_sec,
            live_status,
            enabled,
            priority,
            props,
            notes
        FROM "MapasAgua"."v_map_assets_live"
        {where}
        {order_limit}
    """


def _get_asset_by_id(cur, asset_link_id: str) -> Optional[dict[str, Any]]:
    cur.execute(
        _asset_select_sql(
            "WHERE asset_link_id::text = %s",
            "LIMIT 1",
        ),
        (asset_link_id,),
    )
    return _fetchone_dict(cur)


def _ensure_node_exists(cur, node_id: str) -> None:
    cur.execute(
        """
        SELECT 1
        FROM "MapasAgua".nodes
        WHERE id = %s::uuid
        LIMIT 1
        """,
        (node_id,),
    )
    if not cur.fetchone():
        raise HTTPException(status_code=404, detail="Nodo del mapa no encontrado")


def _ensure_pipe_exists(cur, pipe_id: str) -> None:
    cur.execute(
        """
        SELECT 1
        FROM "MapasAgua".pipes
        WHERE id = %s::uuid
        LIMIT 1
        """,
        (pipe_id,),
    )
    if not cur.fetchone():
        raise HTTPException(status_code=404, detail="Cañería del mapa no encontrada")


# ============================================================
# GET /mapa/assets/live
# Lista activos reales vivos para el mapa
# ============================================================
@router.get("/live")
def list_live_assets(
    asset_type: Optional[AssetType] = None,
    sim_role: Optional[SimRole] = None,
    location_id: Optional[int] = None,
    live_status: Optional[str] = Query(
        None,
        description="ONLINE, STALE, NO_DATA",
    ),
    linked_to_map: Optional[bool] = None,
    enabled: Optional[bool] = None,
    limit: int = Query(500, ge=1, le=5000),
):
    where_parts: list[str] = []
    params: list[Any] = []

    if asset_type:
        where_parts.append("asset_type = %s")
        params.append(asset_type)

    if sim_role:
        where_parts.append("sim_role = %s")
        params.append(sim_role)

    if location_id is not None:
        where_parts.append("location_id = %s")
        params.append(location_id)

    if live_status:
        where_parts.append("live_status = %s")
        params.append(live_status)

    if linked_to_map is not None:
        where_parts.append("linked_to_map = %s")
        params.append(linked_to_map)

    if enabled is not None:
        where_parts.append("enabled = %s")
        params.append(enabled)

    where_sql = ""
    if where_parts:
        where_sql = "WHERE " + " AND ".join(where_parts)

    order_limit = """
        ORDER BY
            asset_type,
            location_id NULLS LAST,
            asset_name NULLS LAST,
            asset_id
        LIMIT %s
    """
    params.append(limit)

    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(_asset_select_sql(where_sql, order_limit), params)
        items = _fetchall_dict(cur)

    return {"items": items}


# ============================================================
# GET /mapa/assets/stats
# Resumen de activos por tipo/estado
# ============================================================
@router.get("/stats")
def get_assets_stats():
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT
                asset_type,
                sim_role,
                live_status,
                linked_to_map,
                count(*)::int AS count
            FROM "MapasAgua"."v_map_assets_live"
            GROUP BY
                asset_type,
                sim_role,
                live_status,
                linked_to_map
            ORDER BY
                asset_type,
                sim_role,
                live_status,
                linked_to_map
            """
        )
        by_status = _fetchall_dict(cur)

        cur.execute(
            """
            SELECT
                count(*)::int AS total,
                count(*) FILTER (WHERE linked_to_map = true)::int AS linked,
                count(*) FILTER (WHERE linked_to_map = false)::int AS unlinked,
                count(*) FILTER (WHERE live_status = 'ONLINE')::int AS online,
                count(*) FILTER (WHERE live_status = 'STALE')::int AS stale,
                count(*) FILTER (WHERE live_status = 'NO_DATA')::int AS no_data
            FROM "MapasAgua"."v_map_assets_live"
            """
        )
        totals = _fetchone_dict(cur) or {}

    return {
        "totals": totals,
        "by_status": by_status,
    }


# ============================================================
# GET /mapa/assets/{asset_link_id}
# Detalle de un activo real
# ============================================================
@router.get("/{asset_link_id}")
def get_asset(asset_link_id: str):
    with get_conn() as conn, conn.cursor() as cur:
        asset = _get_asset_by_id(cur, asset_link_id)

    if not asset:
        raise HTTPException(status_code=404, detail="Activo no encontrado")

    return asset


# ============================================================
# PATCH /mapa/assets/{asset_link_id}
# Actualizar metadatos del activo
# No actualiza valores vivos.
# ============================================================
@router.patch("/{asset_link_id}")
def update_asset(asset_link_id: str, body: AssetUpdateBody):
    updates: list[str] = []
    params: list[Any] = []

    if body.asset_name is not None:
        updates.append("asset_name = %s")
        params.append(body.asset_name)

    if body.sim_role is not None:
        updates.append("sim_role = %s")
        params.append(body.sim_role)

    if body.hydraulic_position is not None:
        updates.append("hydraulic_position = %s")
        params.append(body.hydraulic_position)

    if body.enabled is not None:
        updates.append("enabled = %s")
        params.append(body.enabled)

    if body.priority is not None:
        updates.append("priority = %s")
        params.append(body.priority)

    if body.notes is not None:
        updates.append("notes = %s")
        params.append(body.notes)

    if body.props is not None:
        updates.append("props = %s::jsonb")
        params.append(json.dumps(body.props, ensure_ascii=False))

    if not updates:
        raise HTTPException(status_code=400, detail="No hay campos para actualizar")

    params.append(asset_link_id)

    with get_conn() as conn, conn.cursor() as cur:
        current = _get_asset_by_id(cur, asset_link_id)
        if not current:
            raise HTTPException(status_code=404, detail="Activo no encontrado")

        cur.execute(
            f"""
            UPDATE "MapasAgua"."asset_links"
            SET
                {", ".join(updates)}
            WHERE id = %s::uuid
            """,
            params,
        )

        cur.execute(
            _asset_select_sql(
                "WHERE asset_link_id::text = %s",
                "LIMIT 1",
            ),
            (asset_link_id,),
        )
        asset = _fetchone_dict(cur)

        conn.commit()

    return asset


# ============================================================
# PATCH /mapa/assets/{asset_link_id}/link
# Ubicar/desubicar activo en nodo o cañería del mapa
# ============================================================
@router.patch("/{asset_link_id}/link")
def link_asset_to_map(asset_link_id: str, body: AssetLinkBody):
    if body.clear and (body.map_node_id or body.map_pipe_id):
        raise HTTPException(
            status_code=400,
            detail="Si clear=true no mandes map_node_id ni map_pipe_id",
        )

    if body.map_node_id and body.map_pipe_id:
        raise HTTPException(
            status_code=400,
            detail="Un activo solo puede vincularse a un nodo o a una cañería, no a ambos",
        )

    if not body.clear and not body.map_node_id and not body.map_pipe_id:
        has_other_changes = any(
            [
                body.hydraulic_position is not None,
                body.enabled is not None,
                body.priority is not None,
                body.props is not None,
                body.notes is not None,
            ]
        )

        if not has_other_changes:
            raise HTTPException(
                status_code=400,
                detail="Mandá map_node_id, map_pipe_id, clear=true o algún campo para actualizar",
            )

    with get_conn() as conn, conn.cursor() as cur:
        current = _get_asset_by_id(cur, asset_link_id)
        if not current:
            raise HTTPException(status_code=404, detail="Activo no encontrado")

        if body.map_node_id:
            _ensure_node_exists(cur, body.map_node_id)

        if body.map_pipe_id:
            _ensure_pipe_exists(cur, body.map_pipe_id)

        updates: list[str] = []
        params: list[Any] = []

        if body.clear:
            updates.append("map_node_id = NULL")
            updates.append("map_pipe_id = NULL")
        elif body.map_node_id:
            updates.append("map_node_id = %s::uuid")
            params.append(body.map_node_id)
            updates.append("map_pipe_id = NULL")
        elif body.map_pipe_id:
            updates.append("map_node_id = NULL")
            updates.append("map_pipe_id = %s::uuid")
            params.append(body.map_pipe_id)

        if body.hydraulic_position is not None:
            updates.append("hydraulic_position = %s")
            params.append(body.hydraulic_position)

        if body.enabled is not None:
            updates.append("enabled = %s")
            params.append(body.enabled)

        if body.priority is not None:
            updates.append("priority = %s")
            params.append(body.priority)

        if body.notes is not None:
            updates.append("notes = %s")
            params.append(body.notes)

        if body.props is not None:
            updates.append("props = COALESCE(props, '{}'::jsonb) || %s::jsonb")
            params.append(json.dumps(body.props, ensure_ascii=False))

        if not updates:
            raise HTTPException(status_code=400, detail="No hay cambios para aplicar")

        params.append(asset_link_id)

        cur.execute(
            f"""
            UPDATE "MapasAgua"."asset_links"
            SET
                {", ".join(updates)}
            WHERE id = %s::uuid
            """,
            params,
        )

        cur.execute(
            _asset_select_sql(
                "WHERE asset_link_id::text = %s",
                "LIMIT 1",
            ),
            (asset_link_id,),
        )
        asset = _fetchone_dict(cur)

        conn.commit()

    if not asset:
        raise HTTPException(
            status_code=500,
            detail="No se pudo recuperar el activo actualizado",
        )

    return asset


# ============================================================
# DELETE /mapa/assets/{asset_link_id}/link
# Desubicar activo del mapa
# ============================================================
@router.delete("/{asset_link_id}/link")
def unlink_asset_from_map(asset_link_id: str):
    with get_conn() as conn, conn.cursor() as cur:
        current = _get_asset_by_id(cur, asset_link_id)
        if not current:
            raise HTTPException(status_code=404, detail="Activo no encontrado")

        cur.execute(
            """
            UPDATE "MapasAgua"."asset_links"
            SET
                map_node_id = NULL,
                map_pipe_id = NULL
            WHERE id = %s::uuid
            """,
            (asset_link_id,),
        )

        cur.execute(
            _asset_select_sql(
                "WHERE asset_link_id::text = %s",
                "LIMIT 1",
            ),
            (asset_link_id,),
        )
        asset = _fetchone_dict(cur)

        conn.commit()

    return asset