# app/routes/mapa/sim/repositories.py
from __future__ import annotations

from typing import Any

from .utils import fetchall_dict


def read_pipes(cur, default_diam_mm: float) -> list[dict[str, Any]]:
    cur.execute(
        """
        SELECT
            id::text AS id,
            from_node::text AS from_node,
            to_node::text AS to_node,
            COALESCE(length_m, ST_Length(geom::geography))::double precision AS length_m,
            COALESCE(diametro_mm, %s::int)::double precision AS diametro_mm,
            COALESCE(is_open, true) AS is_open,
            COALESCE(active, true) AS active,
            COALESCE(type, 'WATER') AS type,
            COALESCE(flow_func, '') AS flow_func,
            COALESCE(props, '{}'::jsonb) AS props
        FROM "MapasAgua".pipes
        WHERE COALESCE(active, true) = true
          AND COALESCE(type, 'WATER') = 'WATER'
        """,
        (int(default_diam_mm),),
    )
    return fetchall_dict(cur)


def read_nodes(cur) -> list[dict[str, Any]]:
    cur.execute(
        """
        SELECT
            id::text AS id,
            COALESCE(kind, 'JUNCTION') AS kind,
            elev_m::double precision AS elev_m,
            COALESCE(props->>'label', '') AS label
        FROM "MapasAgua".nodes
        """
    )
    return fetchall_dict(cur)


def read_live_sources(cur) -> list[dict[str, Any]]:
    cur.execute(
        """
        SELECT
            source_id::text AS id,
            node_id::text AS node_id,
            head_m::double precision AS head_m,
            source_name AS label,
            source_type,
            asset_link_id::text AS asset_link_id,
            asset_type,
            asset_id,
            pressure_bar_real::double precision AS pressure_bar_real,
            level_pct::double precision AS level_pct,
            tank_height_m::double precision AS tank_height_m,
            water_height_m::double precision AS water_height_m,
            online,
            age_sec::double precision AS age_sec,
            live_status,
            props
        FROM "MapasAgua"."v_sim_sources_live"
        WHERE enabled = true
          AND head_m IS NOT NULL
          AND node_id IS NOT NULL
        """
    )
    return fetchall_dict(cur)


def read_debug_sources(cur) -> list[dict[str, Any]]:
    cur.execute(
        """
        SELECT
            source_id::text AS id,
            source_type,
            asset_link_id::text AS asset_link_id,
            asset_type,
            asset_id,
            source_name AS label,
            node_id::text AS node_id,
            head_m::double precision AS head_m,
            node_elev_m::double precision AS elev_m,
            pressure_bar_real::double precision AS pressure_bar_real,
            level_pct::double precision AS level_pct,
            tank_height_m::double precision AS tank_height_m,
            water_height_m::double precision AS water_height_m,
            online,
            age_sec::double precision AS age_sec,
            live_status,
            props
        FROM "MapasAgua"."v_sim_sources_live"
        WHERE enabled = true
          AND head_m IS NOT NULL
          AND node_id IS NOT NULL
        ORDER BY source_type, source_name, source_id
        """
    )
    return fetchall_dict(cur)


def read_debug_pipe_counts(cur) -> dict[str, Any]:
    cur.execute(
        """
        SELECT
            count(*)::int AS pipes_total,
            count(*) FILTER (
                WHERE from_node IS NOT NULL
                  AND to_node IS NOT NULL
                  AND from_node <> to_node
            )::int AS pipes_connected,
            count(*) FILTER (
                WHERE from_node IS NULL
                   OR to_node IS NULL
                   OR from_node = to_node
            )::int AS pipes_unconnected,
            count(*) FILTER (
                WHERE COALESCE(active, true) = true
                  AND COALESCE(is_open, true) = true
            )::int AS pipes_open_active
        FROM "MapasAgua".pipes
        """
    )
    return fetchall_dict(cur)[0]


def read_debug_node_counts(cur) -> dict[str, Any]:
    cur.execute(
        """
        SELECT
            count(*)::int AS nodes_total,
            count(*) FILTER (WHERE elev_m IS NOT NULL)::int AS nodes_with_elev,
            count(*) FILTER (WHERE elev_m IS NULL)::int AS nodes_without_elev
        FROM "MapasAgua".nodes
        """
    )
    return fetchall_dict(cur)[0]


def read_debug_source_counts(cur) -> dict[str, Any]:
    cur.execute(
        """
        SELECT
            count(*)::int AS sources_total,
            count(*) FILTER (WHERE source_type = 'MANUAL_SOURCE')::int AS manual_sources,
            count(*) FILTER (WHERE source_type = 'TANK_HEAD')::int AS tank_sources,
            count(*) FILTER (WHERE source_type = 'PRESSURE_MEASURE')::int AS pressure_sources,
            count(*) FILTER (WHERE live_status = 'ONLINE')::int AS online_sources,
            count(*) FILTER (WHERE live_status = 'STALE')::int AS stale_sources,
            count(*) FILTER (WHERE live_status = 'NO_DATA')::int AS no_data_sources
        FROM "MapasAgua"."v_sim_sources_live"
        WHERE enabled = true
          AND head_m IS NOT NULL
          AND node_id IS NOT NULL
        """
    )
    return fetchall_dict(cur)[0]
