from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query
from psycopg.rows import dict_row

from app.db import get_conn

router = APIRouter(
    prefix="/components/network_analyzers",
    tags=["network_analyzers"],
)


@router.get("/{analyzer_id}/pump-energy")
def get_pump_energy_summary(
    analyzer_id: int,
    days: int = Query(30, ge=1, le=90),
):
    if analyzer_id <= 0:
        raise HTTPException(status_code=400, detail="Invalid analyzer_id")

    with get_conn() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                """
                select
                    na.id,
                    na.name,
                    na.location_id,
                    l.name as location_name,
                    r.ts,
                    r.p_kw,
                    r.avg_p_kw,
                    r.max_p_kw,
                    r.pf
                from public.network_analyzers na
                left join public.locations l on l.id = na.location_id
                left join lateral (
                    select ts, p_kw, avg_p_kw, max_p_kw, pf
                    from public.network_analyzer_readings
                    where analyzer_id = na.id
                    order by ts desc
                    limit 1
                ) r on true
                where na.id = %(analyzer_id)s
                """,
                {"analyzer_id": analyzer_id},
            )
            analyzer = cur.fetchone()

            if not analyzer:
                raise HTTPException(status_code=404, detail="Analyzer not found")

            cur.execute(
                """
                with mapped as (
                    select ppa.pump_id
                    from public.pump_power_analyzers ppa
                    where ppa.analyzer_id = %(analyzer_id)s
                      and ppa.enabled = true
                ),
                runs as (
                    select pe.id, pe.pump_id, pe.created_at
                    from public.pump_events pe
                    join mapped m on m.pump_id = pe.pump_id
                    where pe.state = 'run'
                      and pe.created_at >= now() - make_interval(days => %(days)s)
                ),
                clean as (
                    select r.*
                    from runs r
                    where not exists (
                        select 1
                        from public.pump_events x
                        join mapped mx on mx.pump_id = x.pump_id
                        where x.pump_id <> r.pump_id
                          and x.created_at between r.created_at - interval '90 seconds'
                                               and r.created_at + interval '90 seconds'
                    )
                ),
                candidates as (
                    select
                        c.id as event_id,
                        c.pump_id,
                        c.created_at,
                        rr.ts,
                        rr.p_kw,
                        lag(rr.p_kw) over (partition by c.id order by rr.ts) as prev_kw
                    from clean c
                    join public.network_analyzer_readings rr
                      on rr.analyzer_id = %(analyzer_id)s
                     and rr.ts between c.created_at - interval '90 seconds'
                                   and c.created_at + interval '90 seconds'
                    where rr.p_kw is not null
                ),
                jumps as (
                    select distinct on (event_id)
                        event_id,
                        pump_id,
                        created_at,
                        ts as jump_ts,
                        (p_kw - prev_kw) as jump_kw
                    from candidates
                    where prev_kw is not null
                    order by event_id, (p_kw - prev_kw) desc
                ),
                features as (
                    select
                        j.*,
                        (
                            select avg(rr.p_kw)
                            from public.network_analyzer_readings rr
                            where rr.analyzer_id = %(analyzer_id)s
                              and rr.ts between j.jump_ts - interval '45 seconds'
                                            and j.jump_ts - interval '5 seconds'
                        ) as baseline_kw,
                        (
                            select avg(rr.p_kw)
                            from public.network_analyzer_readings rr
                            where rr.analyzer_id = %(analyzer_id)s
                              and rr.ts between j.jump_ts + interval '30 seconds'
                                            and j.jump_ts + interval '90 seconds'
                        ) as steady_kw
                    from jumps j
                ),
                valid_features as (
                    select *
                    from features
                    where baseline_kw is not null
                      and steady_kw is not null
                      and (steady_kw - baseline_kw) between 2 and 300
                      and jump_kw between 1 and 500
                ),
                latest_state as (
                    select distinct on (pe.pump_id)
                        pe.pump_id,
                        pe.state,
                        pe.created_at
                    from public.pump_events pe
                    join mapped m on m.pump_id = pe.pump_id
                    order by pe.pump_id, pe.created_at desc
                )
                select
                    p.id as pump_id,
                    p.name,
                    p.location_id,
                    p.potencia_kw,
                    p.tipo_arranque,
                    ppa.expected_power_kw,
                    ppa.expected_power_tolerance_pct,
                    ls.state as last_state,
                    ls.created_at as last_state_at,
                    count(vf.event_id)::int as valid_starts,
                    round(avg(vf.steady_kw - vf.baseline_kw)::numeric, 2) as operating_kw_est,
                    round(stddev_samp(vf.steady_kw - vf.baseline_kw)::numeric, 2) as operating_kw_sd,
                    round(avg(vf.jump_kw)::numeric, 2) as avg_start_step_kw,
                    round(max(vf.jump_kw)::numeric, 2) as max_start_step_kw
                from public.pump_power_analyzers ppa
                join public.pumps p on p.id = ppa.pump_id
                left join valid_features vf on vf.pump_id = p.id
                left join latest_state ls on ls.pump_id = p.id
                where ppa.analyzer_id = %(analyzer_id)s
                  and ppa.enabled = true
                group by
                    p.id, p.name, p.location_id, p.potencia_kw, p.tipo_arranque,
                    ppa.expected_power_kw, ppa.expected_power_tolerance_pct,
                    ls.state, ls.created_at
                order by p.name
                """,
                {"analyzer_id": analyzer_id, "days": days},
            )
            pumps = cur.fetchall() or []

    return {
        "analyzer": analyzer,
        "window_days": days,
        "pumps": pumps,
    }
