from fastapi import APIRouter, Query, HTTPException
from datetime import datetime, timezone
from psycopg.rows import dict_row

from app.db import get_conn

router = APIRouter(
    prefix="/analyzers",
    tags=["kpi", "energy", "analyzers"],
)

def month_bounds_utc(month: str):
    try:
        year = int(month[0:4])
        mon = int(month[5:7])
        start = datetime(year, mon, 1, tzinfo=timezone.utc)
        if mon == 12:
            end = datetime(year + 1, 1, 1, tzinfo=timezone.utc)
        else:
            end = datetime(year, mon + 1, 1, tzinfo=timezone.utc)
        return start, end
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid month format. Use YYYY-MM")


def parse_ids_csv(analyzer_ids: str) -> list[int]:
    try:
        ids = [int(x.strip()) for x in analyzer_ids.split(",") if x.strip()]
        ids = list(dict.fromkeys(ids))
        if not ids:
            raise ValueError()
        return ids
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid analyzer_ids. Use comma-separated ints, e.g. 1,4")


@router.get("/month_kpis_multi")
def get_analyzers_month_kpis_multi(
    analyzer_ids: str = Query(..., description="Comma-separated analyzer ids. Example: 1,4"),
    month: str = Query(..., description="YYYY-MM"),
    mode: str = Query("combine", description="combine | compare"),
):
    ids = parse_ids_csv(analyzer_ids)
    if mode not in ("combine", "compare"):
        raise HTTPException(status_code=400, detail="Invalid mode. Use combine or compare")

    start_ts, end_ts = month_bounds_utc(month)

    with get_conn() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            # ---------------------------
            # ANALYZERS
            # ---------------------------
            cur.execute(
                """
                select
                  id,
                  name,
                  location_id,
                  model,
                  active,
                  contracted_power_kw
                from public.network_analyzers
                where id = any(%(ids)s)
                order by id
                """,
                {"ids": ids},
            )
            analyzers = cur.fetchall() or []
            if not analyzers:
                raise HTTPException(status_code=404, detail="No analyzers found")

            found_ids = {a["id"] for a in analyzers}
            missing = [x for x in ids if x not in found_ids]
            if missing:
                raise HTTPException(status_code=404, detail=f"Analyzers not found: {missing}")

            # ---------------------------
            # DAILY AGGREGATE BASE
            # ---------------------------
            cur.execute(
                """
                select
                  analyzer_id,
                  day_ts as day,
                  kw_max,
                  kw_avg,
                  kwh_est,
                  pf_avg,
                  pf_min,
                  samples
                from kpi.analyzers_1d
                where analyzer_id = any(%(ids)s)
                  and day_ts >= %(start_date)s
                  and day_ts < %(end_date)s
                order by analyzer_id, day_ts
                """,
                {
                    "ids": ids,
                    "start_date": start_ts.date(),
                    "end_date": end_ts.date(),
                },
            )
            daily_rows = cur.fetchall() or []

            # ---------------------------
            # HOURLY AGGREGATE BASE
            # ---------------------------
            cur.execute(
                """
                select
                  analyzer_id,
                  hour_ts,
                  extract(hour from hour_ts)::int as hour,
                  kw_avg,
                  kw_max,
                  pf_avg,
                  pf_min,
                  samples
                from kpi.analyzers_1h
                where analyzer_id = any(%(ids)s)
                  and hour_ts >= %(start_ts)s
                  and hour_ts < %(end_ts)s
                order by analyzer_id, hour_ts
                """,
                {
                    "ids": ids,
                    "start_ts": start_ts,
                    "end_ts": end_ts,
                },
            )
            hourly_rows = cur.fetchall() or []

    # ---------------------------
    # HELPERS
    # ---------------------------
    analyzer_map = {a["id"]: a for a in analyzers}

    def safe_num(v):
        return float(v) if v is not None else None

    def weighted_avg(pairs):
        # pairs: [(value, weight), ...]
        valid = [(v, w) for v, w in pairs if v is not None and w is not None and w > 0]
        if not valid:
            return None
        num = sum(v * w for v, w in valid)
        den = sum(w for _, w in valid)
        return num / den if den else None

    # ---------------------------
    # COMPARE MODE
    # ---------------------------
    if mode == "compare":
        by_analyzer_daily = {aid: [] for aid in ids}
        by_analyzer_hourly = {aid: [] for aid in ids}

        for r in daily_rows:
            by_analyzer_daily[r["analyzer_id"]].append(r)

        for r in hourly_rows:
            by_analyzer_hourly[r["analyzer_id"]].append(r)

        per_analyzer = []
        for aid in ids:
            drows = by_analyzer_daily.get(aid, [])
            hrows = by_analyzer_hourly.get(aid, [])

            summary = {
                "max_kw": max((safe_num(r["kw_max"]) for r in hrows if r["kw_max"] is not None), default=None),
                "avg_kw": weighted_avg([(safe_num(r["kw_avg"]), safe_num(r["samples"])) for r in hrows]),
                "kwh_est": sum((safe_num(r["kwh_est"]) or 0.0) for r in drows) if drows else None,
                "avg_pf": weighted_avg([(safe_num(r["pf_avg"]), safe_num(r["kw_avg"])) for r in hrows]),
                "min_pf": min((safe_num(r["pf_min"]) for r in hrows if r["pf_min"] is not None), default=None),
                "samples": sum(int(r["samples"] or 0) for r in drows),
                "contracted_power_kw": safe_num(analyzer_map[aid].get("contracted_power_kw")),
            }

            per_analyzer.append(
                {
                    "analyzer": analyzer_map[aid],
                    "summary": summary,
                    "daily": drows,
                    "hourly": hrows,
                }
            )

        return {
            "mode": "compare",
            "month": month,
            "analyzer_ids": ids,
            "items": per_analyzer,
        }

    # ---------------------------
    # COMBINE MODE
    # ---------------------------
    from collections import defaultdict

    daily_group = defaultdict(list)
    for r in daily_rows:
        daily_group[str(r["day"])].append(r)

    combined_daily = []
    for day, rows in sorted(daily_group.items(), key=lambda x: x[0]):
        kwh_est = sum((safe_num(r["kwh_est"]) or 0.0) for r in rows)
        kw_avg = sum((safe_num(r["kw_avg"]) or 0.0) for r in rows)
        pf_avg = weighted_avg([(safe_num(r["pf_avg"]), safe_num(r["kw_avg"])) for r in rows])
        pf_min = min((safe_num(r["pf_min"]) for r in rows if r["pf_min"] is not None), default=None)
        samples = sum(int(r["samples"] or 0) for r in rows)

        combined_daily.append(
            {
                "day": day,
                "kwh_est": kwh_est,
                "avg_kw": kw_avg,
                "avg_pf": pf_avg,
                "min_pf": pf_min,
                "samples": samples,
            }
        )

    hourly_group = defaultdict(list)
    for r in hourly_rows:
        hourly_group[str(r["hour_ts"])].append(r)

    combined_hourly = []
    for hour_ts, rows in sorted(hourly_group.items(), key=lambda x: x[0]):
        kw_avg_sum = sum((safe_num(r["kw_avg"]) or 0.0) for r in rows)
        kw_max_sum = sum((safe_num(r["kw_max"]) or 0.0) for r in rows)
        pf_avg = weighted_avg([(safe_num(r["pf_avg"]), safe_num(r["kw_avg"])) for r in rows])
        pf_min = min((safe_num(r["pf_min"]) for r in rows if r["pf_min"] is not None), default=None)
        samples = sum(int(r["samples"] or 0) for r in rows)

        combined_hourly.append(
            {
                "hour_ts": hour_ts,
                "hour": int(rows[0]["hour"]),
                "avg_kw": kw_avg_sum,
                "max_kw": kw_max_sum,
                "avg_pf": pf_avg,
                "min_pf": pf_min,
                "samples": samples,
            }
        )

    summary = {
        "max_kw": max((r["max_kw"] for r in combined_hourly if r["max_kw"] is not None), default=None),
        "avg_kw": weighted_avg([(r["avg_kw"], r["samples"]) for r in combined_hourly]),
        "kwh_est": sum((r["kwh_est"] or 0.0) for r in combined_daily) if combined_daily else None,
        "avg_pf": weighted_avg([(r["avg_pf"], r["avg_kw"]) for r in combined_hourly]),
        "min_pf": min((r["min_pf"] for r in combined_hourly if r["min_pf"] is not None), default=None),
        "samples": sum(int(r["samples"] or 0) for r in combined_daily),
        "contracted_power_kw": sum((safe_num(a.get("contracted_power_kw")) or 0.0) for a in analyzers),
    }

    return {
        "mode": "combine",
        "month": month,
        "analyzer_ids": ids,
        "analyzers": analyzers,
        "summary": summary,
        "daily": combined_daily,
        "hourly": combined_hourly,
    }