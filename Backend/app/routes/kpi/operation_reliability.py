from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Query
from psycopg.rows import dict_row

from app.db import get_conn

router = APIRouter(
    prefix="/kpi/operation-reliability",
    tags=["kpi-operation-reliability"],
)


def _jsonable(v):
    if v is None:
        return None
    if isinstance(v, (datetime, date)):
        return v.isoformat()
    if isinstance(v, Decimal):
        return float(v)
    if isinstance(v, UUID):
        return str(v)
    return v


def _clean_row(row: dict) -> dict:
    return {k: _jsonable(v) for k, v in row.items()}


def _fetch_all(sql: str, params: tuple = ()) -> list[dict]:
    with get_conn() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(sql, params)
            return [_clean_row(dict(r)) for r in cur.fetchall()]


def _fetch_one(sql: str, params: tuple = ()) -> dict:
    with get_conn() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(sql, params)
            row = cur.fetchone()
            return _clean_row(dict(row)) if row else {}


@router.get("/summary")
def get_operation_reliability_summary():
    sql = """
        select
            (
                select count(*)
                from kpi.v_tank_critical_events_detail
                where status = 'active'
            )::int as active_tank_events,

            (
                select count(*)
                from kpi.v_tank_critical_events_detail
            )::int as total_tank_events,

            (
                select count(*)
                from kpi.v_operation_pumps_front
                where current_state = 'run'
            )::int as pumps_running,

            (
                select count(*)
                from kpi.v_operation_pumps_front
                where current_state = 'stop'
            )::int as pumps_stopped,

            (
                select coalesce(sum(starts_count), 0)
                from kpi.v_operation_pumps_front
            )::int as total_starts,

            (
                select coalesce(sum(stops_count), 0)
                from kpi.v_operation_pumps_front
            )::int as total_stops
    """

    return {
        "ok": True,
        "summary": _fetch_one(sql),
    }


@router.get("/tank-events")
def get_tank_critical_events(
    limit: int = Query(default=50, ge=1, le=500),
    status: str | None = Query(default=None),
    location_id: int | None = Query(default=None),
    tank_id: int | None = Query(default=None),
):
    if status not in ("active", "normalized", None):
        status = None

    sql = """
        select
            id,
            tank_id,
            tank_name,
            location_id,
            location_name,
            event_type,
            event_label,
            configured_limit,
            detected_value,
            started_at,
            ended_at,
            duration_seconds,
            duration_label,
            status,
            status_label,
            created_at
        from kpi.v_tank_critical_events_detail
        where (%s::text is null or status = %s::text)
          and (%s::bigint is null or location_id = %s::bigint)
          and (%s::bigint is null or tank_id = %s::bigint)
        order by started_at desc
        limit %s::int
    """

    items = _fetch_all(
        sql,
        (
            status,
            status,
            location_id,
            location_id,
            tank_id,
            tank_id,
            limit,
        ),
    )

    return {
        "ok": True,
        "items": items,
    }


@router.get("/pumps")
def get_pump_operation_summary(
    location_id: int | None = Query(default=None),
    pump_id: int | None = Query(default=None),
    state: str | None = Query(default=None),
):
    if state not in ("run", "stop", None):
        state = None

    sql = """
        select
            pump_id,
            pump_name,
            location_id,
            location_name,
            current_state,
            current_state_label,
            online,
            starts_count,
            stops_count,
            running_time_label,
            stopped_time_label,
            availability_pct,
            last_started_at,
            last_stopped_at,
            last_activity_at,
            last_activity_label
        from kpi.v_operation_pumps_front
        where pump_id is not null
          and (%s::bigint is null or location_id = %s::bigint)
          and (%s::bigint is null or pump_id = %s::bigint)
          and (%s::text is null or current_state = %s::text)
        order by location_name, pump_name
    """

    items = _fetch_all(
        sql,
        (
            location_id,
            location_id,
            pump_id,
            pump_id,
            state,
            state,
        ),
    )

    return {
        "ok": True,
        "items": items,
    }