# app/routes/mapa/nodes.py
from __future__ import annotations

import json
from typing import Any, Dict, Optional, Literal

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from app.db import get_conn


router = APIRouter(prefix="/nodes", tags=["mapa"])

NodeKind = Literal["JUNCTION", "VALVE", "SOURCE", "PUMP", "DEMAND", "TANK"]


class NodeCreateBody(BaseModel):
    lat: float
    lng: float
    kind: NodeKind = "JUNCTION"
    label: Optional[str] = None
    elev_m: Optional[float] = None
    props: Dict[str, Any] = Field(default_factory=dict)


class NodeUpdateBody(BaseModel):
    lat: Optional[float] = None
    lng: Optional[float] = None
    kind: Optional[NodeKind] = None
    label: Optional[str] = None
    elev_m: Optional[float] = None
    props: Optional[Dict[str, Any]] = None


class SourceUpsertBody(BaseModel):
    node_id: str
    head_m: float
    label: Optional[str] = None
    props: Dict[str, Any] = Field(default_factory=dict)


def _fetchall_dict(cur):
    cols = [d[0] for d in cur.description]
    return [dict(zip(cols, row)) for row in cur.fetchall()]


def _fetchone_dict(cur):
    row = cur.fetchone()
    if not row:
        return None

    cols = [d[0] for d in cur.description]
    return dict(zip(cols, row))


def _node_select_sql(where: str = "", order_limit: str = "") -> str:
    return f"""
        SELECT
            n.id::text AS id,
            COALESCE(n.kind, 'JUNCTION') AS kind,
            n.elev_m::double precision AS elev_m,
            s.head_m::double precision AS head_m,
            d.demand_lps::double precision AS demand_lps,
            COALESCE(n.props->>'label', '') AS label,
            n.props,
            ST_X(n.geom)::double precision AS lng,
            ST_Y(n.geom)::double precision AS lat,
            n.created_at,
            CASE
                WHEN s.node_id IS NOT NULL THEN true
                ELSE false
            END AS is_source
        FROM "MapasAgua".nodes n
        LEFT JOIN "MapasAgua".sources s
            ON s.node_id = n.id
        LEFT JOIN "MapasAgua".demands d
            ON d.node_id = n.id
        {where}
        {order_limit}
    """


# ============================================================
# GET /mapa/nodes
# ============================================================
@router.get("")
def list_nodes(
    limit: int = Query(5000, ge=1, le=20000),
    kind: Optional[str] = None,
):
    where = ""
    params: list[Any] = []

    if kind:
        where = "WHERE n.kind = %s"
        params.append(kind)

    sql = _node_select_sql(where, "ORDER BY n.created_at DESC LIMIT %s")
    params.append(limit)

    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(sql, params)
        items = _fetchall_dict(cur)

    return {"items": items}


# ============================================================
# GET /mapa/nodes/{node_id}
# ============================================================
@router.get("/{node_id}")
def get_node(node_id: str):
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            _node_select_sql("WHERE n.id::text = %s", "LIMIT 1"),
            (node_id,),
        )
        node = _fetchone_dict(cur)

    if not node:
        raise HTTPException(status_code=404, detail="Nodo no encontrado")

    return node


# ============================================================
# POST /mapa/nodes
# Crear nodo manual
# ============================================================
@router.post("")
def create_node(body: NodeCreateBody):
    with get_conn() as conn, conn.cursor() as cur:
        props = dict(body.props or {})

        if body.label is not None and str(body.label).strip():
            props["label"] = str(body.label).strip()

        props_json = json.dumps(props, ensure_ascii=False)

        cur.execute(
            """
            INSERT INTO "MapasAgua".nodes
                (geom, kind, elev_m, props)
            VALUES
                (
                    ST_SetSRID(
                        ST_MakePoint(
                            %s::double precision,
                            %s::double precision
                        ),
                        4326
                    ),
                    %s,
                    %s,
                    %s::jsonb
                )
            RETURNING id::text AS id
            """,
            (
                body.lng,
                body.lat,
                body.kind,
                body.elev_m,
                props_json,
            ),
        )

        inserted = cur.fetchone()

        if not inserted:
            raise HTTPException(
                status_code=500,
                detail="No se pudo crear el nodo",
            )

        cur.execute(
            _node_select_sql("WHERE n.id::text = %s", "LIMIT 1"),
            (inserted[0],),
        )
        node = _fetchone_dict(cur)

        conn.commit()

    if not node:
        raise HTTPException(
            status_code=500,
            detail="No se pudo crear el nodo",
        )

    return node


# ============================================================
# PATCH /mapa/nodes/{node_id}
# Actualizar nodo
# ============================================================
@router.patch("/{node_id}")
def update_node(node_id: str, body: NodeUpdateBody):
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT
                kind,
                elev_m,
                props,
                ST_X(geom)::double precision AS lng,
                ST_Y(geom)::double precision AS lat
            FROM "MapasAgua".nodes
            WHERE id = %s::uuid
            """,
            (node_id,),
        )

        current = _fetchone_dict(cur)

        if not current:
            raise HTTPException(status_code=404, detail="Nodo no encontrado")

        next_kind = body.kind or current.get("kind") or "JUNCTION"
        next_elev = body.elev_m if body.elev_m is not None else current.get("elev_m")

        curr_props = current.get("props") or {}

        if not isinstance(curr_props, dict):
            curr_props = {}

        if body.props is None:
            next_props = curr_props
        else:
            next_props = {
                **curr_props,
                **(body.props or {}),
            }

        if body.label is not None:
            lab = str(body.label).strip()

            if lab:
                next_props["label"] = lab
            else:
                next_props.pop("label", None)

        next_props_json = json.dumps(next_props, ensure_ascii=False)

        if body.lat is not None and body.lng is not None:
            cur.execute(
                """
                UPDATE "MapasAgua".nodes
                SET
                    geom = ST_SetSRID(
                        ST_MakePoint(
                            %s::double precision,
                            %s::double precision
                        ),
                        4326
                    ),
                    kind = %s,
                    elev_m = %s,
                    props = %s::jsonb
                WHERE id = %s::uuid
                """,
                (
                    body.lng,
                    body.lat,
                    next_kind,
                    next_elev,
                    next_props_json,
                    node_id,
                ),
            )
        else:
            cur.execute(
                """
                UPDATE "MapasAgua".nodes
                SET
                    kind = %s,
                    elev_m = %s,
                    props = %s::jsonb
                WHERE id = %s::uuid
                """,
                (
                    next_kind,
                    next_elev,
                    next_props_json,
                    node_id,
                ),
            )

        cur.execute(
            _node_select_sql("WHERE n.id::text = %s", "LIMIT 1"),
            (node_id,),
        )
        node = _fetchone_dict(cur)

        conn.commit()

    if not node:
        raise HTTPException(
            status_code=500,
            detail="No se pudo actualizar el nodo",
        )

    return node


# ============================================================
# DELETE /mapa/nodes/{node_id}
# Borra nodo si no está conectado a cañerías
# ============================================================
@router.delete("/{node_id}")
def delete_node(node_id: str):
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT count(*)::int
            FROM "MapasAgua".pipes
            WHERE from_node = %s::uuid
               OR to_node = %s::uuid
            """,
            (
                node_id,
                node_id,
            ),
        )

        used = cur.fetchone()[0]

        if used and used > 0:
            raise HTTPException(
                status_code=409,
                detail=(
                    f"No se puede borrar: el nodo está conectado "
                    f"a {used} cañería(s). Desconectá primero."
                ),
            )

        cur.execute(
            """
            DELETE FROM "MapasAgua".sources
            WHERE node_id = %s::uuid
            """,
            (node_id,),
        )

        cur.execute(
            """
            DELETE FROM "MapasAgua".demands
            WHERE node_id = %s::uuid
            """,
            (node_id,),
        )

        cur.execute(
            """
            DELETE FROM "MapasAgua".nodes
            WHERE id = %s::uuid
            """,
            (node_id,),
        )

        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Nodo no encontrado")

        conn.commit()

    return {
        "ok": True,
        "node_id": node_id,
    }


# ============================================================
# GET /mapa/nodes/sources/list
# Lista fuentes hidráulicas
# ============================================================
@router.get("/sources/list")
def list_sources():
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT
                s.id::text AS id,
                s.node_id::text AS node_id,
                s.head_m::double precision AS head_m,
                s.props,
                COALESCE(
                    n.props->>'label',
                    s.props->>'label',
                    ''
                ) AS label,
                n.elev_m::double precision AS elev_m,
                ST_X(n.geom)::double precision AS lng,
                ST_Y(n.geom)::double precision AS lat
            FROM "MapasAgua".sources s
            JOIN "MapasAgua".nodes n
                ON n.id = s.node_id
            ORDER BY label, s.id
            """
        )

        items = _fetchall_dict(cur)

    return {"items": items}


# ============================================================
# POST /mapa/nodes/sources
# Crea o actualiza fuente hidráulica
# ============================================================
@router.post("/sources")
def upsert_source(body: SourceUpsertBody):
    props = dict(body.props or {})

    if body.label:
        props["label"] = body.label

    props_json = json.dumps(props, ensure_ascii=False)

    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT id
            FROM "MapasAgua".nodes
            WHERE id = %s::uuid
            """,
            (body.node_id,),
        )

        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Nodo no encontrado")

        cur.execute(
            """
            UPDATE "MapasAgua".nodes
            SET
                kind = 'SOURCE',
                props = props || %s::jsonb
            WHERE id = %s::uuid
            """,
            (
                props_json,
                body.node_id,
            ),
        )

        cur.execute(
            """
            INSERT INTO "MapasAgua".sources
                (id, node_id, head_m, props)
            VALUES
                (
                    gen_random_uuid(),
                    %s::uuid,
                    %s,
                    %s::jsonb
                )
            ON CONFLICT (node_id)
            DO UPDATE SET
                head_m = EXCLUDED.head_m,
                props = "MapasAgua".sources.props || EXCLUDED.props
            RETURNING
                id::text AS id,
                node_id::text AS node_id,
                head_m::double precision AS head_m,
                props
            """,
            (
                body.node_id,
                body.head_m,
                props_json,
            ),
        )

        source = _fetchone_dict(cur)

        conn.commit()

    return {
        "ok": True,
        "source": source,
    }