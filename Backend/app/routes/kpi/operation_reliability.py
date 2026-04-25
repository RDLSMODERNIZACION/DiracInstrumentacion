from datetime import date, datetime
from decimal import Decimal
from uuid import UUID
from calendar import monthrange

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


def _month_bounds(month: str | None):
    if not month:
        today = date.today()
        year = today.year
        month_num = today.month
    else:
        parts = month.split("-")
        year = int(parts[0])
        month_num = int(parts[1])

    start = date(year, month_num, 1)
    end = date(year, month_num, monthrange(year, month_num)[1])
    return start, end


@router.get("/summary")
def get_operation_reliability_summary(
    location_id: int | None = Query(default=None),
):
    sql = """
        select
            (
                select count(*)
                from kpi.v_tank_critical_events_detail
                where status = 'active'
                  and (%s::bigint is null or location_id = %s::bigint)
            )::int as active_tank_events,

            (
                select count(*)
                from kpi.v_tank_critical_events_detail
                where (%s::bigint is null or location_id = %s::bigint)
            )::int as total_tank_events,

            (
                select count(*)
                from kpi.v_operation_pumps_front
                where current_state = 'run'
                  and (%s::bigint is null or location_id = %s::bigint)
            )::int as pumps_running,

            (
                select count(*)
                from kpi.v_operation_pumps_front
                where current_state = 'stop'
                  and (%s::bigint is null or location_id = %s::bigint)
            )::int as pumps_stopped,

            (
                select coalesce(sum(starts_count), 0)
                from kpi.v_operation_pumps_front
                where (%s::bigint is null or location_id = %s::bigint)
            )::int as total_starts,

            (
                select coalesce(sum(stops_count), 0)
                from kpi.v_operation_pumps_front
                where (%s::bigint is null or location_id = %s::bigint)
            )::int as total_stops
    """

    return {
        "ok": True,
        "summary": _fetch_one(
            sql,
            (
                location_id,
                location_id,
                location_id,
                location_id,
                location_id,
                location_id,
                location_id,
                location_id,
                location_id,
                location_id,
                location_id,
                location_id,
            ),
        ),
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

    return {
        "ok": True,
        "items": _fetch_all(
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
        ),
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

    return {
        "ok": True,
        "items": _fetch_all(
            sql,
            (
                location_id,
                location_id,
                pump_id,
                pump_id,
                state,
                state,
            ),
        ),
    }


@router.get("/pump-daily")
def get_pump_daily(
    month: str | None = Query(
        default=None,
        description="Mes en formato YYYY-MM. Si se omite usa el mes actual.",
    ),
    location_id: int | None = Query(default=None),
    pump_id: int | None = Query(default=None),
):
    start, end = _month_bounds(month)

    sql = """
        select
            day_ts,
            pump_id,
            pump_name,
            location_id,
            location_name,
            starts_count,
            stops_count,
            running_seconds,
            stopped_seconds,
            availability_pct,
            total_state_events,
            first_event_at,
            last_event_at,
            estado_operativo,
            problem_score
        from kpi.v_pump_operation_1d
        where day_ts between %s::date and %s::date
          and (%s::bigint is null or location_id = %s::bigint)
          and (%s::bigint is null or pump_id = %s::bigint)
        order by day_ts asc, problem_score desc, pump_name asc
    """

    items = _fetch_all(
        sql,
        (
            start,
            end,
            location_id,
            location_id,
            pump_id,
            pump_id,
        ),
    )

    return {
        "ok": True,
        "month": start.strftime("%Y-%m"),
        "from": start.isoformat(),
        "to": end.isoformat(),
        "items": items,
    }


@router.get("/pump-daily-chart")
def get_pump_daily_chart(
    month: str | None = Query(default=None),
    location_id: int | None = Query(default=None),
    pump_id: int | None = Query(default=None),
):
    start, end = _month_bounds(month)

    sql = """
        select
            day_ts,
            coalesce(sum(starts_count), 0)::int as total_starts,
            coalesce(sum(stops_count), 0)::int as total_stops,
            round(avg(availability_pct), 2) as avg_availability_pct,
            coalesce(sum(problem_score), 0)::numeric(12,2) as total_problem_score
        from kpi.v_pump_operation_1d
        where day_ts between %s::date and %s::date
          and (%s::bigint is null or location_id = %s::bigint)
          and (%s::bigint is null or pump_id = %s::bigint)
        group by day_ts
        order by day_ts asc
    """

    return {
        "ok": True,
        "month": start.strftime("%Y-%m"),
        "from": start.isoformat(),
        "to": end.isoformat(),
        "items": _fetch_all(
            sql,
            (
                start,
                end,
                location_id,
                location_id,
                pump_id,
                pump_id,
            ),
        ),
    }


@router.get("/pump-ranking")
def get_pump_ranking(
    month: str | None = Query(default=None),
    location_id: int | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
):
    start, end = _month_bounds(month)

    sql = """
        select
            pump_id,
            pump_name,
            location_id,
            location_name,

            coalesce(sum(starts_count), 0)::int as starts_count,
            coalesce(sum(stops_count), 0)::int as stops_count,
            coalesce(sum(running_seconds), 0)::int as running_seconds,
            coalesce(sum(stopped_seconds), 0)::int as stopped_seconds,

            case
                when coalesce(sum(running_seconds + stopped_seconds), 0) > 0 then
                    round(
                        sum(running_seconds)::numeric
                        / nullif(sum(running_seconds + stopped_seconds)::numeric, 0)
                        * 100,
                        2
                    )
                else null
            end as availability_pct,

            coalesce(sum(total_state_events), 0)::int as total_state_events,
            min(first_event_at) as first_event_at,
            max(last_event_at) as last_event_at,
            coalesce(sum(problem_score), 0)::numeric(12,2) as problem_score,

            case
                when coalesce(sum(starts_count), 0) >= 40 then 'ciclado severo'
                when coalesce(sum(starts_count), 0) >= 20 then 'muchos arranques'
                when (
                    coalesce(sum(running_seconds + stopped_seconds), 0) > 0
                    and (
                        sum(running_seconds)::numeric
                        / nullif(sum(running_seconds + stopped_seconds)::numeric, 0)
                        * 100
                    ) < 30
                ) then 'baja disponibilidad'
                when coalesce(sum(starts_count), 0) >= 10 then 'revisar ciclos'
                else 'normal'
            end as estado_operativo

        from kpi.v_pump_operation_1d
        where day_ts between %s::date and %s::date
          and (%s::bigint is null or location_id = %s::bigint)
        group by
            pump_id,
            pump_name,
            location_id,
            location_name
        order by problem_score desc, starts_count desc, pump_name asc
        limit %s::int
    """

    return {
        "ok": True,
        "month": start.strftime("%Y-%m"),
        "from": start.isoformat(),
        "to": end.isoformat(),
        "items": _fetch_all(
            sql,
            (
                start,
                end,
                location_id,
                location_id,
                limit,
            ),
        ),
    }


@router.get("/tank-daily")
def get_tank_daily(
    month: str | None = Query(default=None),
    location_id: int | None = Query(default=None),
    tank_id: int | None = Query(default=None),
):
    start, end = _month_bounds(month)

    sql = """
        select
            day_ts,
            tank_id,
            tank_name,
            location_id,
            location_name,

            total_events,
            active_events,
            normalized_events,

            low_events,
            low_critical_events,
            high_events,
            high_critical_events,

            min_detected_value,
            max_detected_value,
            avg_detected_value,

            total_duration_seconds,
            estado_operativo
        from kpi.v_tank_operation_1d
        where day_ts between %s::date and %s::date
          and (%s::bigint is null or location_id = %s::bigint)
          and (%s::bigint is null or tank_id = %s::bigint)
        order by day_ts asc, total_events desc, tank_name asc
    """

    return {
        "ok": True,
        "month": start.strftime("%Y-%m"),
        "from": start.isoformat(),
        "to": end.isoformat(),
        "items": _fetch_all(
            sql,
            (
                start,
                end,
                location_id,
                location_id,
                tank_id,
                tank_id,
            ),
        ),
    }


@router.get("/tank-daily-chart")
def get_tank_daily_chart(
    month: str | None = Query(default=None),
    location_id: int | None = Query(default=None),
    tank_id: int | None = Query(default=None),
):
    start, end = _month_bounds(month)

    sql = """
        select
            day_ts,
            coalesce(sum(total_events), 0)::int as total_events,
            coalesce(sum(active_events), 0)::int as active_events,
            coalesce(sum(low_events), 0)::int as low_events,
            coalesce(sum(low_critical_events), 0)::int as low_critical_events,
            coalesce(sum(high_events), 0)::int as high_events,
            coalesce(sum(high_critical_events), 0)::int as high_critical_events,
            coalesce(sum(total_duration_seconds), 0)::int as total_duration_seconds
        from kpi.v_tank_operation_1d
        where day_ts between %s::date and %s::date
          and (%s::bigint is null or location_id = %s::bigint)
          and (%s::bigint is null or tank_id = %s::bigint)
        group by day_ts
        order by day_ts asc
    """

    return {
        "ok": True,
        "month": start.strftime("%Y-%m"),
        "from": start.isoformat(),
        "to": end.isoformat(),
        "items": _fetch_all(
            sql,
            (
                start,
                end,
                location_id,
                location_id,
                tank_id,
                tank_id,
            ),
        ),
    }


@router.get("/tank-ranking")
def get_tank_ranking(
    month: str | None = Query(default=None),
    location_id: int | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
):
    start, end = _month_bounds(month)

    sql = """
        select
            tank_id,
            tank_name,
            location_id,
            location_name,

            coalesce(sum(total_events), 0)::int as total_events,
            coalesce(sum(active_events), 0)::int as active_events,
            coalesce(sum(normalized_events), 0)::int as normalized_events,

            coalesce(sum(low_events), 0)::int as low_events,
            coalesce(sum(low_critical_events), 0)::int as low_critical_events,
            coalesce(sum(high_events), 0)::int as high_events,
            coalesce(sum(high_critical_events), 0)::int as high_critical_events,

            min(min_detected_value) as min_detected_value,
            max(max_detected_value) as max_detected_value,
            round(avg(avg_detected_value), 2) as avg_detected_value,

            coalesce(sum(total_duration_seconds), 0)::int as total_duration_seconds,

            (
                coalesce(sum(total_events), 0) * 2.0
                + coalesce(sum(low_critical_events), 0) * 5.0
                + coalesce(sum(high_critical_events), 0) * 5.0
                + coalesce(sum(active_events), 0) * 8.0
                + case
                    when coalesce(sum(total_duration_seconds), 0) > 3600 then 10
                    else 0
                  end
            )::numeric(12,2) as problem_score,

            case
                when coalesce(sum(active_events), 0) > 0 then 'activo'
                when coalesce(sum(low_critical_events), 0) >= 5 then 'riesgo vacio'
                when coalesce(sum(high_critical_events), 0) >= 5 then 'riesgo rebalse'
                when coalesce(sum(total_events), 0) >= 20 then 'muy inestable'
                when coalesce(sum(total_events), 0) >= 10 then 'inestable'
                when coalesce(sum(total_duration_seconds), 0) > 3600 then 'evento prolongado'
                else 'normal'
            end as estado_operativo

        from kpi.v_tank_operation_1d
        where day_ts between %s::date and %s::date
          and (%s::bigint is null or location_id = %s::bigint)
        group by
            tank_id,
            tank_name,
            location_id,
            location_name
        order by problem_score desc, total_events desc, tank_name asc
        limit %s::int
    """

    return {
        "ok": True,
        "month": start.strftime("%Y-%m"),
        "from": start.isoformat(),
        "to": end.isoformat(),
        "items": _fetch_all(
            sql,
            (
                start,
                end,
                location_id,
                location_id,
                limit,
            ),
        ),
    }