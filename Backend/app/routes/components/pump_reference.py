from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from psycopg.rows import dict_row

from app.db import get_conn
from app.routes.components.pump_energy import _load_pumps

router = APIRouter(
    prefix="/components/network_analyzers",
    tags=["network_analyzers"],
)


@router.get("/pump-reference/{pump_id}")
def get_pump_reference(pump_id: int):
    if pump_id <= 0:
        raise HTTPException(status_code=400, detail="Invalid pump_id")

    with get_conn() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                """
                select
                    pem.id,
                    pem.pump_id,
                    p.name as pump_name,
                    pem.measured_at,
                    pem.source,
                    pem.i_l1_a,
                    pem.i_l2_a,
                    pem.i_l3_a,
                    pem.i_avg_a,
                    pem.startup_type,
                    pem.notes
                from public.pump_electrical_measurements pem
                join public.pumps p on p.id = pem.pump_id
                where pem.pump_id = %(pump_id)s
                order by pem.measured_at desc, pem.id desc
                limit 1
                """,
                {"pump_id": pump_id},
            )
            row = cur.fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="No official electrical reference found")

    return row


@router.get("/pump-diagnostic/{pump_id}")
def get_pump_diagnostic(pump_id: int):
    if pump_id <= 0:
        raise HTTPException(status_code=400, detail="Invalid pump_id")

    with get_conn() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                """
                select analyzer_id
                from public.pump_power_analyzers
                where pump_id = %(pump_id)s
                  and enabled = true
                order by updated_at desc nulls last, created_at desc nulls last
                limit 1
                """,
                {"pump_id": pump_id},
            )
            mapping = cur.fetchone()
            if not mapping:
                raise HTTPException(status_code=404, detail="Pump has no enabled analyzer mapping")

            analyzer_id = int(mapping["analyzer_id"])
            model_rows = _load_pumps(cur, analyzer_id, 30)
            model = next((r for r in model_rows if int(r["pump_id"]) == pump_id), None)

            cur.execute(
                """
                select
                    pem.measured_at,
                    pem.i_l1_a,
                    pem.i_l2_a,
                    pem.i_l3_a,
                    pem.i_avg_a,
                    pem.startup_type
                from public.pump_electrical_measurements pem
                where pem.pump_id = %(pump_id)s
                order by pem.measured_at desc, pem.id desc
                limit 1
                """,
                {"pump_id": pump_id},
            )
            official = cur.fetchone()

            cur.execute(
                """
                select state, created_at
                from public.pump_events
                where pump_id = %(pump_id)s
                order by created_at desc
                limit 1
                """,
                {"pump_id": pump_id},
            )
            last_event = cur.fetchone()

            power_ref_kw = float(model["operating_kw_est"]) if model and model.get("operating_kw_est") is not None else None
            model_current_a = float(model["current_a_est"]) if model and model.get("current_a_est") is not None else None
            official_current_a = float(official["i_avg_a"]) if official and official.get("i_avg_a") is not None else None

            model_current_error_pct = None
            if official_current_a and model_current_a is not None:
                model_current_error_pct = round((model_current_a - official_current_a) / official_current_a * 100.0, 1)

            power_live_kw = None
            power_deviation_pct = None
            power_status = "monitoring"
            power_reason = "Sin arranque reciente aislable"
            diagnostic_quality = "none"

            if last_event and str(last_event["state"]).lower() == "run" and last_event.get("created_at"):
                event_ts = last_event["created_at"]
                now = datetime.now(timezone.utc)
                age_s = (now - event_ts).total_seconds()

                # Solo diagnosticamos el arranque mientras la ventana temporal todavía
                # representa el evento reciente. Evita atribuir el consumo total de planta
                # a una bomba que lleva horas funcionando.
                if 35 <= age_s <= 600 and power_ref_kw is not None and power_ref_kw > 0:
                    cur.execute(
                        """
                        select exists (
                            select 1
                            from public.pump_events x
                            join public.pump_power_analyzers ppa
                              on ppa.pump_id = x.pump_id
                             and ppa.analyzer_id = %(analyzer_id)s
                             and ppa.enabled = true
                            where x.pump_id <> %(pump_id)s
                              and x.created_at between %(event_ts)s - interval '30 seconds'
                                                   and %(event_ts)s + interval '30 seconds'
                        ) as contaminated
                        """,
                        {"analyzer_id": analyzer_id, "pump_id": pump_id, "event_ts": event_ts},
                    )
                    contamination = cur.fetchone()
                    contaminated = bool(contamination and contamination["contaminated"])

                    if contaminated:
                        power_reason = "Arranque simultáneo: no se atribuye anomalía individual"
                        diagnostic_quality = "contaminated"
                    else:
                        cur.execute(
                            """
                            select
                                (
                                    select avg(p_kw)
                                    from public.network_analyzer_readings
                                    where analyzer_id = %(analyzer_id)s
                                      and p_kw is not null
                                      and ts between %(event_ts)s - interval '45 seconds'
                                                 and %(event_ts)s - interval '5 seconds'
                                ) as baseline_kw,
                                (
                                    select avg(p_kw)
                                    from public.network_analyzer_readings
                                    where analyzer_id = %(analyzer_id)s
                                      and p_kw is not null
                                      and ts between %(event_ts)s + interval '30 seconds'
                                                 and least(%(event_ts)s + interval '120 seconds', now())
                                ) as steady_kw
                            """,
                            {"analyzer_id": analyzer_id, "event_ts": event_ts},
                        )
                        sig = cur.fetchone()
                        if sig and sig["baseline_kw"] is not None and sig["steady_kw"] is not None:
                            power_live_kw = round(float(sig["steady_kw"]) - float(sig["baseline_kw"]), 2)
                            if power_live_kw > 0:
                                power_deviation_pct = round((power_live_kw - power_ref_kw) / power_ref_kw * 100.0, 1)
                                diagnostic_quality = "isolated"
                                if power_deviation_pct < -15.0:
                                    power_status = "low_power"
                                    power_reason = "Potencia inferida por debajo del rango normal"
                                elif power_deviation_pct > 15.0:
                                    power_status = "high_power"
                                    power_reason = "Potencia inferida por encima del rango normal"
                                else:
                                    power_status = "normal"
                                    power_reason = "Potencia inferida dentro del rango normal"
                        else:
                            power_reason = "Todavía no hay suficientes muestras posteriores al arranque"
                            diagnostic_quality = "insufficient"

    return {
        "pump_id": pump_id,
        "analyzer_id": analyzer_id,
        "state": model.get("last_state") if model else (last_event.get("state") if last_event else None),
        "official": {
            "current_a": official_current_a,
            "i_l1_a": float(official["i_l1_a"]) if official and official.get("i_l1_a") is not None else None,
            "i_l2_a": float(official["i_l2_a"]) if official and official.get("i_l2_a") is not None else None,
            "i_l3_a": float(official["i_l3_a"]) if official and official.get("i_l3_a") is not None else None,
            "startup_type": official.get("startup_type") if official else None,
            "measured_at": official.get("measured_at") if official else None,
        },
        "model": {
            "current_a": model_current_a,
            "current_error_pct": model_current_error_pct,
            "power_ref_kw": power_ref_kw,
            "valid_starts": int(model["valid_starts"]) if model and model.get("valid_starts") is not None else 0,
        },
        "live": {
            "power_kw": power_live_kw,
            "power_deviation_pct": power_deviation_pct,
            "power_status": power_status,
            "power_reason": power_reason,
            "quality": diagnostic_quality,
        },
    }
