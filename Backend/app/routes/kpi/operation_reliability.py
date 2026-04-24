from fastapi import APIRouter, Query
from psycopg.rows import dict_row

from app.db import get_conn

router = APIRouter(prefix="/kpi/operation-reliability", tags=["kpi-operation-reliability"])


@router.get("/tank-events")
def get_tank_critical_events(
    limit: int = Query(default=50, ge=1, le=500),
    status: str | None = Query(default=None),
):
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
        where (%s is null or status = %s)
        order by started_at desc
        limit %s
    """

    with get_conn() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(sql, (status, status, limit))
            return {
                "ok": True,
                "items": cur.fetchall(),
            }


@router.get("/pumps")
def get_pump_operation_summary(
    location_id: int | None = Query(default=None),
):
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
        where (%s is null or location_id = %s)
        order by location_name, pump_name
    """

    with get_conn() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(sql, (location_id, location_id))
            return {
                "ok": True,
                "items": cur.fetchall(),
            }


@router.get("/summary")
def get_operation_reliability_summary():
    sql = """
        select
            (select count(*) from kpi.v_tank_critical_events_detail where status = 'active') as active_tank_events,
            (select count(*) from kpi.v_tank_critical_events_detail) as total_tank_events,
            (select count(*) from kpi.v_operation_pumps_front where current_state = 'run') as pumps_running,
            (select count(*) from kpi.v_operation_pumps_front where current_state = 'stop') as pumps_stopped,
            (select coalesce(sum(starts_count), 0) from kpi.v_operation_pumps_front) as total_starts,
            (select coalesce(sum(stops_count), 0) from kpi.v_operation_pumps_front) as total_stops
    """

    with get_conn() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(sql)
            row = cur.fetchone()

            return {
                "ok": True,
                "summary": row,
            }