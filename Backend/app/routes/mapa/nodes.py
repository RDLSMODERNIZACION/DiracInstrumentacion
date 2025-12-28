# app/routes/mapa/nodes.py
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Any, Dict, Optional, Literal

from app.db import get_conn

router = APIRouter(prefix="/nodes", tags=["mapa"])


# ----------------------------
# Models
# ----------------------------

NodeKind = Literal["JUNCTION", "VALVE", "SOURCE", "PUMP", "DEMAND"]


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
    props: Optional[Dict[str, Any]] = None  # si viene, mergeamos


def _fetchall_dict(cur):
    cols = [d[0] for d in cur.description]
    return [dict(zip(cols, row)) for row in cur.fetchall()]


def _fetchone_dict(cur):
    row = cur.fetchone()
    if not row:
        return None
    cols = [d[0] for d in cur.description]
    return dict(zip(cols, row))


# ----------------------------
# Endpoints
# ----------------------------

@router.get("")
def list_nodes(limit: int = 2000):
    limit = max(1, min(int(limit), 5000))
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT
              id::text as id,
              COALESCE(kind,'JUNCTION') as kind,
              elev_m,
              COALESCE(props->>'label','') as label,
              props,
              ST_X(geom)::double precision as lng,
              ST_Y(geom)::double precision as lat,
              created_at
            FROM "MapasAgua".nodes
            ORDER BY created_at DESC
            LIMIT %s
            """,
            (limit,),
        )
        items = _fetchall_dict(cur)
    return {"items": items}


@router.post("")
def create_node(body: NodeCreateBody):
    with get_conn() as conn, conn.cursor() as cur:
        props = dict(body.props or {})
        if body.label is not None and str(body.label).strip():
            props["label"] = str(body.label).strip()

        cur.execute(
            """
            INSERT INTO "MapasAgua".nodes (geom, kind, elev_m, props)
            VALUES (
              ST_SetSRID(ST_MakePoint(%s::double precision, %s::double precision), 4326),
              %s,
              %s,
              %s::jsonb
            )
            RETURNING
              id::text as id,
              COALESCE(kind,'JUNCTION') as kind,
              elev_m,
              COALESCE(props->>'label','') as label,
              props,
              ST_X(geom)::double precision as lng,
              ST_Y(geom)::double precision as lat,
              created_at
            """,
            (body.lng, body.lat, body.kind, body.elev_m, props),
        )
        node = _fetchone_dict(cur)
        conn.commit()

    if not node:
        raise HTTPException(500, "No se pudo crear el nodo")
    return node


@router.patch("/{node_id}")
def update_node(node_id: str, body: NodeUpdateBody):
    with get_conn() as conn, conn.cursor() as cur:
        # Traemos actual para merge de props
        cur.execute(
            """
            SELECT kind, elev_m, props,
                   ST_X(geom)::double precision as lng,
                   ST_Y(geom)::double precision as lat
            FROM "MapasAgua".nodes
            WHERE id = %s::uuid
            """,
            (node_id,),
        )
        current = _fetchone_dict(cur)
        if not current:
            raise HTTPException(404, "Nodo no encontrado")

        next_kind = body.kind or current.get("kind") or "JUNCTION"
        next_elev = body.elev_m if body.elev_m is not None else current.get("elev_m")

        # Merge props
        curr_props = current.get("props") or {}
        if not isinstance(curr_props, dict):
            curr_props = {}

        if body.props is None:
            next_props = curr_props
        else:
            next_props = {**curr_props, **(body.props or {})}

        if body.label is not None:
            lab = str(body.label).strip()
            if lab:
                next_props["label"] = lab
            else:
                # label vacío => eliminar
                next_props.pop("label", None)

        # Geom update si viene lat/lng
        if body.lat is not None and body.lng is not None:
            cur.execute(
                """
                UPDATE "MapasAgua".nodes
                SET geom = ST_SetSRID(ST_MakePoint(%s::double precision, %s::double precision), 4326),
                    kind = %s,
                    elev_m = %s,
                    props = %s::jsonb
                WHERE id = %s::uuid
                RETURNING
                  id::text as id,
                  COALESCE(kind,'JUNCTION') as kind,
                  elev_m,
                  COALESCE(props->>'label','') as label,
                  props,
                  ST_X(geom)::double precision as lng,
                  ST_Y(geom)::double precision as lat,
                  created_at
                """,
                (body.lng, body.lat, next_kind, next_elev, next_props, node_id),
            )
        else:
            cur.execute(
                """
                UPDATE "MapasAgua".nodes
                SET kind = %s,
                    elev_m = %s,
                    props = %s::jsonb
                WHERE id = %s::uuid
                RETURNING
                  id::text as id,
                  COALESCE(kind,'JUNCTION') as kind,
                  elev_m,
                  COALESCE(props->>'label','') as label,
                  props,
                  ST_X(geom)::double precision as lng,
                  ST_Y(geom)::double precision as lat,
                  created_at
                """,
                (next_kind, next_elev, next_props, node_id),
            )

        node = _fetchone_dict(cur)
        conn.commit()

    if not node:
        raise HTTPException(500, "No se pudo actualizar el nodo")
    return node


@router.delete("/{node_id}")
def delete_node(node_id: str):
    """
    Borra el nodo SOLO si no está referenciado por pipes.
    (Si querés permitir borrar en cascada, lo hacemos después con lógica explícita).
    """
    with get_conn() as conn, conn.cursor() as cur:
        # Protecciones: si está conectado a pipes, no dejar borrar
        cur.execute(
            """
            SELECT count(*)::int
            FROM "MapasAgua".pipes
            WHERE from_node = %s::uuid OR to_node = %s::uuid
            """,
            (node_id, node_id),
        )
        used = cur.fetchone()[0]
        if used and used > 0:
            raise HTTPException(
                409,
                f"No se puede borrar: el nodo está conectado a {used} cañería(s). Desconectá primero.",
            )

        cur.execute(
            """DELETE FROM "MapasAgua".nodes WHERE id = %s::uuid""",
            (node_id,),
        )
        if cur.rowcount == 0:
            raise HTTPException(404, "Nodo no encontrado")
        conn.commit()

    return {"ok": True, "node_id": node_id}
