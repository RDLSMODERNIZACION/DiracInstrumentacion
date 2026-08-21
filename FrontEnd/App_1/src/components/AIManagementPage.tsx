import React, { useCallback, useEffect, useMemo, useState } from "react";
import { scopedUrl, getApiHeaders } from "@/lib/config";

type AIAnalysis = {
  estado: "normal" | "atencion" | "critico";
  titulo: string;
  resumen: string;
  hallazgos: string[];
  recomendaciones: string[];
  riesgos: string[];
  confianza: number | null;
};

type AIResponse = {
  ok: boolean;
  cached?: boolean;
  model?: string;
  created_at?: string;
  analysis: AIAnalysis;
  context?: any;
};

type ContextResponse = {
  ok: boolean;
  context: any;
};

function fmt(v: any, d = 1) {
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(d) : "--";
}

function fmtInt(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n).toLocaleString("es-AR") : "--";
}

function fmtDate(v?: string | null) {
  if (!v) return "--";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "--";
  return d.toLocaleString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function stateClasses(state?: string) {
  if (state === "critico") {
    return {
      dot: "bg-red-500",
      badge: "border-red-200 bg-red-50 text-red-700",
      panel: "border-red-200",
    };
  }
  if (state === "atencion") {
    return {
      dot: "bg-amber-500",
      badge: "border-amber-200 bg-amber-50 text-amber-700",
      panel: "border-amber-200",
    };
  }
  return {
    dot: "bg-emerald-500",
    badge: "border-emerald-200 bg-emerald-50 text-emerald-700",
    panel: "border-emerald-200",
  };
}

async function api<T>(path: string, init?: RequestInit, timeoutMs = 65_000): Promise<T> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(scopedUrl(path), {
      ...init,
      headers: {
        ...getApiHeaders(),
        ...(init?.headers || {}),
      },
      signal: ac.signal,
    });

    if (!res.ok) {
      let detail = "";
      try {
        const body = await res.json();
        detail = body?.detail ? String(body.detail) : JSON.stringify(body);
      } catch {
        detail = await res.text().catch(() => "");
      }
      throw new Error(detail || `HTTP ${res.status}`);
    }

    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

function Metric({
  label,
  value,
  help,
}: {
  label: string;
  value: React.ReactNode;
  help?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </div>
      <div className="mt-1 text-2xl font-black tracking-tight text-slate-950">
        {value}
      </div>
      {help ? <div className="mt-1 text-xs text-slate-500">{help}</div> : null}
    </div>
  );
}

export default function AIManagementPage() {
  const [context, setContext] = useState<any>(null);
  const [analysis, setAnalysis] = useState<AIAnalysis | null>(null);
  const [createdAt, setCreatedAt] = useState<string | null>(null);
  const [model, setModel] = useState<string | null>(null);
  const [cached, setCached] = useState(false);
  const [loadingContext, setLoadingContext] = useState(true);
  const [loadingAI, setLoadingAI] = useState(true);
  const [error, setError] = useState("");

  const loadContext = useCallback(async () => {
    setLoadingContext(true);
    try {
      const data = await api<ContextResponse>("/kpi/ai/context", undefined, 20_000);
      setContext(data.context);
    } catch (e: any) {
      setError(e?.message || "No se pudo cargar el estado operacional.");
    } finally {
      setLoadingContext(false);
    }
  }, []);

  const runAI = useCallback(async (force = false) => {
    setLoadingAI(true);
    setError("");
    try {
      const data = await api<AIResponse>(
        `/kpi/ai/analyze?force=${force ? "true" : "false"}`,
        { method: "POST" },
        65_000
      );
      setAnalysis(data.analysis);
      setCreatedAt(data.created_at ?? null);
      setModel(data.model ?? null);
      setCached(Boolean(data.cached));
      if (data.context) setContext(data.context);
    } catch (e: any) {
      setError(e?.message || "No se pudo generar el anÃ¡lisis de IA.");
    } finally {
      setLoadingAI(false);
    }
  }, []);

  useEffect(() => {
    void loadContext();
    void runAI(false);
  }, [loadContext, runAI]);

  const network = context?.network ?? {};
  const alerts = Array.isArray(context?.active_alerts) ? context.active_alerts : [];
  const electrical = Array.isArray(context?.electrical) ? context.electrical : [];

  const tone = stateClasses(analysis?.estado);

  const criticalAlerts = useMemo(
    () => alerts.filter((a: any) => String(a.severity).toLowerCase() === "critical").length,
    [alerts]
  );

  return (
    <div className="space-y-5">
      <section className={`rounded-3xl border bg-white p-5 shadow-sm ${tone.panel}`}>
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-4xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${tone.dot}`} />
              <span className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
                Inteligencia operacional
              </span>
              {analysis ? (
                <span className={`rounded-full border px-2.5 py-1 text-xs font-bold uppercase ${tone.badge}`}>
                  {analysis.estado === "atencion" ? "AtenciÃ³n" : analysis.estado}
                </span>
              ) : null}
            </div>

            <h2 className="mt-3 text-2xl font-black tracking-tight text-slate-950">
              {analysis?.titulo ?? "AnÃ¡lisis de la operaciÃ³n"}
            </h2>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              {loadingAI && !analysis
                ? "Analizando el estado hidrÃ¡ulico, elÃ©ctrico y la disponibilidad de equipos..."
                : analysis?.resumen ??
                  "El estado determinÃ­stico de la red ya estÃ¡ disponible. El anÃ¡lisis de IA aparecerÃ¡ aquÃ­."}
            </p>

            <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-400">
              <span>Datos operativos actualizados cada 5 minutos</span>
              {createdAt ? <span>IA: {fmtDate(createdAt)}</span> : null}
              {model ? <span>Modelo: {model}</span> : null}
              {cached ? <span>Resultado reutilizado (&lt;5 min)</span> : null}
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              void loadContext();
              void runAI(true);
            }}
            disabled={loadingAI}
            className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-wait disabled:opacity-60"
          >
            {loadingAI ? "Analizando..." : "Reanalizar operaciÃ³n"}
          </button>
        </div>
      </section>

      {error ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <div className="font-bold">La capa de datos funciona, pero la IA requiere atenciÃ³n.</div>
          <div className="mt-1">{error}</div>
          {error.includes("OPENAI_API_KEY") ? (
            <div className="mt-2 text-xs">
              ConfigurÃ¡ <b>OPENAI_API_KEY</b> en las variables de entorno del backend de Render.
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="grid grid-cols-2 gap-3 xl:grid-cols-6">
        <Metric
          label="Reserva"
          value={`${fmt(network.storage_pct_weighted)}%`}
          help={`${fmtInt(network.stored_m3)} de ${fmtInt(network.storage_capacity_m3)} mÂ³`}
        />
        <Metric
          label="Tendencia 3 h"
          value={`${fmt(network.storage_trend_3h_pct_points)} pp`}
          help={`${fmtInt(network.storage_change_m3_3h)} mÂ³`}
        />
        <Metric
          label="Bombas"
          value={`${fmtInt(network.pumps_running)}/${fmtInt(network.pumps_available)}`}
          help="En marcha / disponibles"
        />
        <Metric
          label="Uso disponible"
          value={`${fmt(network.pump_use_pct_of_available)}%`}
          help="Por cantidad de bombas"
        />
        <Metric
          label="Alertas abiertas"
          value={fmtInt(alerts.length)}
          help={criticalAlerts ? `${criticalAlerts} crÃ­ticas` : "Sin crÃ­ticas"}
        />
        <Metric
          label="Tanque mÃ­nimo"
          value={`${fmt(network.lowest_tank_pct)}%`}
          help={`${fmtInt(network.tanks_low)} bajo 30%`}
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-base font-black text-slate-950">Hallazgos de IA</h3>
          <div className="mt-3 space-y-2">
            {(analysis?.hallazgos ?? []).length ? (
              analysis!.hallazgos.map((x, i) => (
                <div key={i} className="rounded-xl bg-slate-50 px-3 py-2.5 text-sm text-slate-700">
                  {x}
                </div>
              ))
            ) : (
              <div className="text-sm text-slate-400">
                {loadingAI ? "Procesando..." : "Sin hallazgos de IA todavÃ­a."}
              </div>
            )}
          </div>
        </div>

        <div className="rounded-3xl border border-blue-200 bg-blue-50/40 p-5 shadow-sm">
          <h3 className="text-base font-black text-blue-950">Acciones sugeridas</h3>
          <div className="mt-3 space-y-2">
            {(analysis?.recomendaciones ?? []).length ? (
              analysis!.recomendaciones.map((x, i) => (
                <div key={i} className="rounded-xl border border-blue-100 bg-white px-3 py-2.5 text-sm text-slate-700">
                  {x}
                </div>
              ))
            ) : (
              <div className="text-sm text-blue-500/70">
                {loadingAI ? "Preparando recomendaciones..." : "Sin recomendaciones todavÃ­a."}
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-black text-slate-950">Alertas operativas activas</h3>
            <p className="mt-1 text-xs text-slate-500">
              Estas alertas las calcula la base cada 5 minutos; no dependen de la IA.
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
            {alerts.length} abiertas
          </span>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {alerts.length ? (
            alerts.map((a: any) => (
              <div
                key={a.id}
                className={`rounded-2xl border p-4 ${
                  String(a.severity).toLowerCase() === "critical"
                    ? "border-red-200 bg-red-50"
                    : "border-amber-200 bg-amber-50"
                }`}
              >
                <div className="text-sm font-black text-slate-900">{a.title}</div>
                <div className="mt-1 text-sm leading-5 text-slate-700">{a.message}</div>
                <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
                  {a.location_name ? <span>{a.location_name}</span> : null}
                  <span>Ãšltima detecciÃ³n: {fmtDate(a.last_seen_at)}</span>
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-700">
              No hay alertas operativas activas.
            </div>
          )}
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-base font-black text-slate-950">Estado elÃ©ctrico por planta</h3>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="py-2 pr-3">Planta</th>
                <th className="py-2 pr-3 text-right">Potencia</th>
                <th className="py-2 pr-3 text-right">FP</th>
                <th className="py-2 pr-3 text-right">Bombas ON</th>
                <th className="py-2 pr-3 text-right">Disponibles</th>
                <th className="py-2 pr-3">MediciÃ³n</th>
              </tr>
            </thead>
            <tbody>
              {electrical.map((e: any) => (
                <tr key={e.analyzer_id} className="border-b last:border-0">
                  <td className="py-2.5 pr-3">
                    <div className="font-semibold text-slate-800">{e.analyzer_name}</div>
                    <div className="text-xs text-slate-400">{e.location_name}</div>
                  </td>
                  <td className="py-2.5 pr-3 text-right font-semibold">{fmt(e.p_kw)} kW</td>
                  <td className={`py-2.5 pr-3 text-right font-bold ${
                    Number(e.pf) < 0.96 && Number(e.p_kw) >= 20 ? "text-amber-600" : "text-slate-800"
                  }`}>
                    {fmt(e.pf, 3)}
                  </td>
                  <td className="py-2.5 pr-3 text-right">{fmtInt(e.pumps_running)}</td>
                  <td className="py-2.5 pr-3 text-right">{fmtInt(e.pumps_available)}</td>
                  <td className="py-2.5 pr-3 text-slate-500">{fmtDate(e.measured_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

