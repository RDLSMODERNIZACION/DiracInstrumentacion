# app/routes/kpi/ai_operation.py
import json
import os
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Dict, List, Optional

import requests
from fastapi import APIRouter, HTTPException, Query
from psycopg.rows import dict_row

from app.db import get_conn

router = APIRouter(prefix="/kpi/ai", tags=["kpi-ai"])

OPENAI_API_URL = "https://api.openai.com/v1/responses"
DEFAULT_MODEL = os.getenv("OPENAI_MODEL", "gpt-5.6-luna")


def _jsonable(value: Any) -> Any:
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (datetime,)):
        return value.isoformat()
    if isinstance(value, dict):
        return {k: _jsonable(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_jsonable(v) for v in value]
    return value


def _fetch_all(cur, sql: str, params: tuple = ()) -> List[Dict[str, Any]]:
    cur.execute(sql, params)
    return [_jsonable(dict(r)) for r in cur.fetchall()]


def _fetch_one(cur, sql: str, params: tuple = ()) -> Optional[Dict[str, Any]]:
    cur.execute(sql, params)
    row = cur.fetchone()
    return _jsonable(dict(row)) if row else None


def build_operation_context() -> Dict[str, Any]:
    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        network = _fetch_one(cur, "select * from kpi.v_ai_network_now") or {}

        alerts = _fetch_all(
            cur,
            """
            select
              id, rule_key, severity, status, location_name, title, message,
              value_numeric, threshold_numeric, detected_at, last_seen_at
            from kpi.v_ai_active_alerts
            order by
              case severity when 'critical' then 0 when 'warning' then 1 else 2 end,
              last_seen_at desc
            limit 30
            """
        )

        electrical = _fetch_all(
            cur,
            """
            select
              analyzer_id, analyzer_name, location_name, measured_at,
              p_kw, q_kvar, pf, pumps_running, pumps_available, age_sec
            from kpi.v_ai_electrical_now
            order by analyzer_id
            """
        )

        pumps = _fetch_all(
            cur,
            """
            select
              pump_id, pump_name, location_id, location_name,
              disponible, disponibilidad_descripcion, tipo_indisponibilidad,
              fecha_estimada_retorno, is_running, current_state_at, online,
              starts_24h, stops_24h, running_hours_24h,
              caudal_nominal_m3h, potencia_kw, criticidad
            from kpi.v_ai_impulsion_now
            order by location_name, pump_name
            """
        )

        tanks = _fetch_all(
            cur,
            """
            select
              tank_id, tank_name, location_id, location_name, capacity_m3,
              current_level, min_24h, max_24h, avg_24h,
              level_1h_ago, level_3h_ago,
              trend_1h_pct_points, trend_3h_pct_points,
              stored_m3, stored_m3_1h_ago, stored_m3_3h_ago
            from kpi.v_ai_distribution_now
            order by location_name, tank_name
            """
        )

        power_map = _fetch_all(
            cur,
            """
            select
              pump_id, pump_name, analyzer_id, analyzer_name,
              expected_power_kw, expected_power_tolerance_pct, enabled
            from kpi.v_ai_pump_power_map
            where enabled = true
            order by analyzer_id, pump_name
            """
        )

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "network": network,
        "active_alerts": alerts,
        "electrical": electrical,
        "pumps": pumps,
        "tanks": tanks,
        "pump_power_map": power_map,
    }


def _extract_output_text(payload: Dict[str, Any]) -> str:
    for item in payload.get("output", []) or []:
        if item.get("type") != "message":
            continue
        for content in item.get("content", []) or []:
            if content.get("type") == "output_text":
                return str(content.get("text") or "")
    return ""


def _normalize_analysis(obj: Dict[str, Any]) -> Dict[str, Any]:
    estado = str(obj.get("estado") or "atencion").lower().strip()
    if estado not in {"normal", "atencion", "critico"}:
        estado = "atencion"

    def _strings(v: Any) -> List[str]:
        if not isinstance(v, list):
            return []
        return [str(x).strip() for x in v if str(x).strip()][:8]

    try:
        confianza = float(obj.get("confianza", 0.7))
    except Exception:
        confianza = 0.7
    confianza = max(0.0, min(1.0, confianza))

    return {
        "estado": estado,
        "titulo": str(obj.get("titulo") or "Análisis operativo de la red").strip(),
        "resumen": str(obj.get("resumen") or "").strip(),
        "hallazgos": _strings(obj.get("hallazgos")),
        "recomendaciones": _strings(obj.get("recomendaciones")),
        "riesgos": _strings(obj.get("riesgos")),
        "confianza": confianza,
    }


def _call_openai(context: Dict[str, Any]) -> Dict[str, Any]:
    api_key = os.getenv("OPENAI_API_KEY", "").strip()
    if not api_key:
        raise HTTPException(
            status_code=503,
            detail="Falta configurar OPENAI_API_KEY en el backend de Render."
        )

    model = os.getenv("OPENAI_MODEL", DEFAULT_MODEL).strip() or DEFAULT_MODEL

    instructions = """
Sos un asistente de operación para una red municipal de agua.
Analizá exclusivamente los datos JSON provistos. No inventes mediciones, causas ni equipos.

Objetivo:
- interpretar el estado hidráulico, eléctrico y de disponibilidad;
- priorizar alertas persistentes ya detectadas por reglas;
- relacionar nivel/almacenamiento, tendencia, bombas disponibles/en marcha,
  potencia, factor de potencia y asociaciones bomba-analizador;
- señalar inconsistencias que ameriten revisión;
- proponer acciones de VERIFICACIÓN u OPERACIÓN, pero nunca afirmar que ejecutaste una maniobra.

Reglas:
- Si no hay evidencia suficiente para una causa, decí que debe verificarse.
- Un FP bajo con carga significativa merece atención.
- Una caída rápida de almacenamiento merece atención aunque ningún tanque esté crítico.
- No confundas "online" con "disponible".
- No supongas potencia individual de una bomba si expected_power_kw está vacío.
- No uses conocimiento externo para completar datos faltantes.
- Las recomendaciones deben ser concretas y cortas.
- Respondé en español técnico claro.

Devolvé SOLO JSON válido con esta forma:
{
  "estado": "normal|atencion|critico",
  "titulo": "string",
  "resumen": "string",
  "hallazgos": ["string"],
  "recomendaciones": ["string"],
  "riesgos": ["string"],
  "confianza": 0.0
}
"""

    body = {
        "model": model,
        "store": False,
        "instructions": instructions,
        "input": json.dumps(context, ensure_ascii=False, separators=(",", ":")),
        "max_output_tokens": 900,
    }

    try:
        res = requests.post(
            OPENAI_API_URL,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json=body,
            timeout=55,
        )
    except requests.RequestException as exc:
        raise HTTPException(status_code=502, detail=f"Error conectando con OpenAI: {exc}")

    if not res.ok:
        detail = res.text[:1200]
        raise HTTPException(
            status_code=502,
            detail=f"OpenAI respondió {res.status_code}: {detail}",
        )

    raw = res.json()
    text = _extract_output_text(raw).strip()
    if not text:
        raise HTTPException(status_code=502, detail="OpenAI no devolvió texto utilizable.")

    # tolera ```json ... ```
    if text.startswith("```"):
        text = text.replace("```json", "", 1).replace("```", "").strip()

    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        raise HTTPException(
            status_code=502,
            detail="La respuesta de IA no vino como JSON válido.",
        )

    analysis = _normalize_analysis(parsed)
    return {"model": model, "analysis": analysis, "raw": raw}


def _latest_analysis(max_age_minutes: int = 5) -> Optional[Dict[str, Any]]:
    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            """
            select
              id, created_at, model, source, status, title, summary,
              findings, recommendations, risks, confidence, context_snapshot
            from kpi.ai_operation_analyses
            where created_at >= now() - (%s || ' minutes')::interval
            order by created_at desc
            limit 1
            """,
            (max_age_minutes,),
        )
        row = cur.fetchone()
    return _jsonable(dict(row)) if row else None


@router.get("/context", summary="Contexto operacional consolidado para IA")
def ai_operation_context():
    return {"ok": True, "context": build_operation_context()}


@router.get("/latest", summary="Último análisis IA guardado")
def ai_latest():
    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        row = _fetch_one(
            cur,
            """
            select
              id, created_at, model, source, status, title, summary,
              findings, recommendations, risks, confidence, context_snapshot
            from kpi.ai_operation_analyses
            order by created_at desc
            limit 1
            """
        )
    return {"ok": True, "item": row}


@router.post("/analyze", summary="Analiza la operación actual con IA")
def analyze_operation(
    force: bool = Query(False, description="Si true, ignora cache de 5 minutos"),
):
    if not force:
        cached = _latest_analysis(5)
        if cached:
            return {
                "ok": True,
                "cached": True,
                "analysis": {
                    "estado": cached["status"],
                    "titulo": cached["title"],
                    "resumen": cached["summary"],
                    "hallazgos": cached["findings"] or [],
                    "recomendaciones": cached["recommendations"] or [],
                    "riesgos": cached["risks"] or [],
                    "confianza": float(cached["confidence"]) if cached["confidence"] is not None else None,
                },
                "model": cached["model"],
                "created_at": cached["created_at"],
                "context": cached.get("context_snapshot") or {},
            }

    context = build_operation_context()
    result = _call_openai(context)
    analysis = result["analysis"]

    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            """
            insert into kpi.ai_operation_analyses (
              model, source, status, title, summary,
              findings, recommendations, risks, confidence,
              context_snapshot, raw_response
            )
            values (
              %s, 'openai', %s, %s, %s,
              %s::jsonb, %s::jsonb, %s::jsonb, %s,
              %s::jsonb, %s::jsonb
            )
            returning id, created_at
            """,
            (
                result["model"],
                analysis["estado"],
                analysis["titulo"],
                analysis["resumen"],
                json.dumps(analysis["hallazgos"], ensure_ascii=False),
                json.dumps(analysis["recomendaciones"], ensure_ascii=False),
                json.dumps(analysis["riesgos"], ensure_ascii=False),
                analysis["confianza"],
                json.dumps(context, ensure_ascii=False, default=str),
                json.dumps(result["raw"], ensure_ascii=False, default=str),
            ),
        )
        saved = dict(cur.fetchone())
        conn.commit()

    return {
        "ok": True,
        "cached": False,
        "analysis": analysis,
        "model": result["model"],
        "created_at": saved["created_at"],
        "context": context,
    }
