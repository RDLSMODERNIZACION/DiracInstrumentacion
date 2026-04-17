import React, { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  BarChart,
  Bar,
  Cell,
  ReferenceLine,
  LabelList,
} from "recharts";

import { getApiRoot, getApiHeaders } from "@/lib/config";

type Props = {
  analyzerId?: number;
  locationId?: number;
};

type AnalyzerOption = {
  id: number;
  name: string;
  location_id: number | null;
  location_name?: string | null;
  company_id?: number | null;
  model?: string | null;
  ip?: string | null;
  port?: number | null;
  unit_id?: number | null;
  active?: boolean;
  created_at?: string | null;
  contracted_power_kw?: number | null;
  contracted_kw?: number | null;
  max_contracted_kw?: number | null;
  power_limit_kw?: number | null;
};

type KpiDayRow = {
  ts: string;
  kwh_est: number | null;
  kw_avg: number | null;
  kw_max: number | null;
  pf_avg: number | null;
  pf_min: number | null;
  q_kvar_avg?: number | null;
  q_kvar_max?: number | null;
  samples: number | null;
};

function toNum(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "string" ? Number(v.replace(",", ".")) : Number(v);
  return Number.isFinite(n) ? n : null;
}

function normalizePf(v: any): number | null {
  const n = toNum(v);
  if (n === null) return null;
  if (n === -1) return null;
  if (!Number.isFinite(n)) return null;

  const abs = Math.abs(n);
  if (abs === 0) return null;
  if (abs > 1) return null;

  return abs;
}

function fmt(v: any, decimals = 2, unit = ""): string {
  const n = toNum(v);
  if (n === null) return `--${unit}`;
  return `${n.toFixed(decimals)}${unit}`;
}

function fmtPf(v: any, decimals = 3): string {
  const n = normalizePf(v);
  if (n === null) return "--";
  return n.toFixed(decimals);
}

function fmtInt(v: any, unit = ""): string {
  const n = toNum(v);
  if (n === null) return `--${unit}`;
  return `${Math.round(n).toLocaleString("es-AR")}${unit}`;
}

function fmtBarValue(v: any): string {
  const n = toNum(v);
  if (n === null) return "";
  return n.toLocaleString("es-AR", { maximumFractionDigits: 0 });
}

function isoDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function monthRange(monthStr: string) {
  const [y, m] = monthStr.split("-").map((x) => Number(x));
  const start = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999));
  return { start: isoDate(start), end: isoDate(end) };
}

function prevMonth(monthStr: string) {
  const [y, m] = monthStr.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1, 1));
  d.setUTCMonth(d.getUTCMonth() - 1);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function nextMonth(monthStr: string) {
  const [y, m] = monthStr.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1, 1));
  d.setUTCMonth(d.getUTCMonth() + 1);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function startOfDayISO_AR(dateStr: string) {
  return `${dateStr}T00:00:00-03:00`;
}

function endOfDayISO_AR(dateStr: string) {
  return `${dateStr}T23:59:59.999-03:00`;
}

const PF_REF = 0.95;

function getContractedKw(a?: AnalyzerOption | null): number | null {
  if (!a) return null;
  return (
    toNum(a.contracted_power_kw) ??
    toNum(a.contracted_kw) ??
    toNum(a.max_contracted_kw) ??
    toNum(a.power_limit_kw) ??
    null
  );
}

async function fetchAnalyzersByLocation(
  locationId: number,
  signal?: AbortSignal
): Promise<AnalyzerOption[]> {
  const root = getApiRoot();
  const url = `${root}/components/network_analyzers?location_id=${locationId}`;

  const r = await fetch(url, {
    method: "GET",
    headers: getApiHeaders({ "Content-Type": undefined as any }),
    cache: "no-store",
    signal,
  });

  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`${r.status} ${r.statusText}${txt ? ` - ${txt}` : ""}`);
  }

  const json = await r.json();
  return Array.isArray(json) ? json : json?.value ?? [];
}

async function fetchHistory(
  analyzerId: number,
  params: { from: string; to: string; granularity: "day" },
  signal?: AbortSignal
): Promise<any> {
  const root = getApiRoot();
  const qs = new URLSearchParams({
    from: params.from,
    to: params.to,
    granularity: params.granularity,
  }).toString();

  const url = `${root}/components/network_analyzers/${analyzerId}/history?${qs}`;
  const r = await fetch(url, {
    method: "GET",
    headers: getApiHeaders({ "Content-Type": "application/json" as any }),
    cache: "no-store",
    signal,
  });

  if (r.status === 404) throw new Error("SIN_HISTORIA");
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`${r.status} ${r.statusText}${txt ? ` - ${txt}` : ""}`);
  }
  return await r.json();
}

function ValueBox({
  label,
  value,
  subtext,
  danger = false,
}: {
  label: string;
  value: string;
  subtext?: string;
  danger?: boolean;
}) {
  return (
    <div
      className={`rounded-md border px-3 py-2 ${
        danger ? "border-red-300 bg-red-50" : "border-gray-300 bg-white"
      }`}
    >
      <div className="text-[11px] text-gray-600">{label}</div>
      <div className={`text-lg font-semibold ${danger ? "text-red-700" : "text-gray-900"}`}>
        {value}
      </div>
      {subtext ? <div className="text-[11px] text-gray-500">{subtext}</div> : null}
    </div>
  );
}

export default function EnergyEfficiencyPage({
  analyzerId: initialAnalyzerId = 1,
  locationId,
}: Props) {
  const [analyzerId, setAnalyzerId] = useState<number>(initialAnalyzerId);
  const [analyzers, setAnalyzers] = useState<AnalyzerOption[]>([]);
  const [loadingAnalyzers, setLoadingAnalyzers] = useState(false);
  const [analyzersError, setAnalyzersError] = useState<string | null>(null);

  const today = useMemo(() => isoDate(new Date()), []);
  const thisMonth = useMemo(() => today.slice(0, 7), [today]);

  const [selectedMonth, setSelectedMonth] = useState<string>(thisMonth);
  const [histError, setHistError] = useState<string | null>(null);
  const [monthRows, setMonthRows] = useState<KpiDayRow[]>([]);
  const [loadingHist, setLoadingHist] = useState(false);

  const hasLocationSelected = locationId !== undefined && locationId !== null;

  const currentAnalyzer = useMemo(
    () => analyzers.find((a) => a.id === analyzerId) ?? null,
    [analyzers, analyzerId]
  );

  const contractedKw = useMemo(() => getContractedKw(currentAnalyzer), [currentAnalyzer]);

  useEffect(() => {
    if (!hasLocationSelected) {
      setAnalyzers([]);
      setAnalyzersError(null);
      setLoadingAnalyzers(false);
      setMonthRows([]);
      setHistError(null);
      return;
    }

    let alive = true;
    const ctrl = new AbortController();

    async function run() {
      try {
        setLoadingAnalyzers(true);
        setAnalyzersError(null);

        const rows = await fetchAnalyzersByLocation(locationId as number, ctrl.signal);
        if (!alive) return;

        setAnalyzers(rows);

        const exists = rows.some((a) => a.id === analyzerId);
        if (!exists && rows.length > 0) {
          setAnalyzerId(rows[0].id);
        }
      } catch (e: any) {
        if (!alive) return;
        setAnalyzers([]);
        setAnalyzersError(e?.message ?? String(e));
      } finally {
        if (!alive) return;
        setLoadingAnalyzers(false);
      }
    }

    run();
    return () => {
      alive = false;
      ctrl.abort();
    };
  }, [hasLocationSelected, locationId, analyzerId]);

  useEffect(() => {
    if (!hasLocationSelected || !analyzerId) {
      setMonthRows([]);
      setHistError(null);
      return;
    }

    let alive = true;
    const ctrl = new AbortController();

    async function run() {
      try {
        setLoadingHist(true);
        setHistError(null);

        const { start, end } = monthRange(selectedMonth);
        const from = startOfDayISO_AR(start);
        const to = endOfDayISO_AR(end);

        const json = await fetchHistory(analyzerId, { from, to, granularity: "day" }, ctrl.signal);
        const arr = Array.isArray(json) ? json : json?.points ?? json?.days ?? [];

        const pts: KpiDayRow[] = (arr || [])
          .map((r: any) => ({
            ts: String(r.ts ?? r.day_ts ?? r.day),
            kwh_est: toNum(r.kwh_est ?? r.kwh),
            kw_avg: toNum(r.kw_avg),
            kw_max: toNum(r.kw_max),
            pf_avg: normalizePf(r.pf_avg),
            pf_min: normalizePf(r.pf_min),
            q_kvar_avg: toNum(r.q_kvar_avg ?? r.reactive_kvar_avg ?? r.q_kvar),
            q_kvar_max: toNum(r.q_kvar_max ?? r.reactive_kvar_max),
            samples: toNum(r.samples) as any,
          }))
          .filter((r) => !!r.ts);

        if (!alive) return;
        setMonthRows(pts);
      } catch (e: any) {
        if (!alive) return;
        if (String(e?.message).includes("SIN_HISTORIA")) setHistError("Sin histórico para ese período.");
        else setHistError(e?.message ?? String(e));
      } finally {
        if (!alive) return;
        setLoadingHist(false);
      }
    }

    run();
    return () => {
      alive = false;
      ctrl.abort();
    };
  }, [hasLocationSelected, analyzerId, selectedMonth]);

  const monthRowsSorted = useMemo(() => {
    return [...monthRows].sort((a, b) => String(a.ts).localeCompare(String(b.ts)));
  }, [monthRows]);

  const activeEnergyKwh = useMemo(() => {
    return monthRowsSorted
      .map((r) => toNum(r.kwh_est))
      .filter((x): x is number => typeof x === "number")
      .reduce((a, b) => a + b, 0);
  }, [monthRowsSorted]);

  const avgDailyKwh = useMemo(() => {
    const vals = monthRowsSorted
      .map((r) => toNum(r.kwh_est))
      .filter((x): x is number => typeof x === "number");
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  }, [monthRowsSorted]);

  const reactiveKvarAvgMonth = useMemo(() => {
    const vals = monthRowsSorted
      .map((r) => toNum(r.q_kvar_avg))
      .filter((x): x is number => typeof x === "number");
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  }, [monthRowsSorted]);

  const reactiveKvarMaxMonth = useMemo(() => {
    const vals = monthRowsSorted
      .map((r) => toNum(r.q_kvar_max))
      .filter((x): x is number => typeof x === "number");
    return vals.length ? Math.max(...vals) : null;
  }, [monthRowsSorted]);

  const pfAvgMonth = useMemo(() => {
    const vals = monthRowsSorted
      .map((r) => normalizePf(r.pf_avg))
      .filter((x): x is number => typeof x === "number");
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  }, [monthRowsSorted]);

  const peakKw = useMemo(() => {
    let best: { date: string; kw: number } | null = null;

    for (const r of monthRowsSorted) {
      const kw = toNum(r.kw_max);
      if (typeof kw !== "number") continue;
      if (!best || kw > best.kw) best = { date: String(r.ts).slice(0, 10), kw };
    }

    return best;
  }, [monthRowsSorted]);

  const exceedsContract = useMemo(() => {
    if (contractedKw === null || !peakKw) return false;
    return peakKw.kw > contractedKw;
  }, [contractedKw, peakKw]);

  const monthChartData = useMemo(() => {
    return monthRowsSorted.map((r) => {
      const pfAvg = normalizePf(r.pf_avg);
      const pfMin = normalizePf(r.pf_min);
      const lowPf =
        (typeof pfAvg === "number" && pfAvg < PF_REF) ||
        (typeof pfMin === "number" && pfMin < PF_REF);

      return {
        day: String(r.ts).slice(8, 10),
        date: String(r.ts).slice(0, 10),
        kwh: toNum(r.kwh_est) ?? undefined,
        kwhLabel: fmtBarValue(r.kwh_est),
        kw_max: toNum(r.kw_max) ?? undefined,
        q_kvar_avg: toNum(r.q_kvar_avg) ?? undefined,
        q_kvar_max: toNum(r.q_kvar_max) ?? undefined,
        pf_avg: pfAvg ?? undefined,
        pf_min: pfMin ?? undefined,
        lowPf,
      };
    });
  }, [monthRowsSorted]);

  const monthTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const d = payload[0]?.payload;
    return (
      <div className="rounded-md border bg-white px-3 py-2 text-xs shadow-sm">
        <div className="font-medium">{d?.date}</div>
        <div>Consumo: {fmt(d?.kwh, 2, " kWh")}</div>
        <div>Pico: {fmt(d?.kw_max, 2, " kW")}</div>
        <div>Reactiva prom: {fmt(d?.q_kvar_avg, 2, " kVAr")}</div>
        <div>Reactiva máx: {fmt(d?.q_kvar_max, 2, " kVAr")}</div>
        <div>PF prom: {fmtPf(d?.pf_avg, 3)}</div>
        {d?.lowPf ? <div className="mt-1 text-red-700">PF bajo detectado</div> : null}
      </div>
    );
  };

  if (!hasLocationSelected) {
    return (
      <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-4 text-sm text-amber-800">
        Seleccione una ubicación para ver la eficiencia energética.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-gray-300 bg-[#f7f4ed] px-4 py-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-base font-semibold text-gray-900">Resumen energético</div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <label className="flex items-center gap-1">
              <span className="text-gray-600">Analizador:</span>
              <select
                value={analyzerId}
                onChange={(e) => setAnalyzerId(Number(e.target.value))}
                className="rounded-md border border-gray-300 bg-white px-2 py-1"
                disabled={loadingAnalyzers || analyzers.length === 0}
              >
                {loadingAnalyzers ? (
                  <option value="">Cargando...</option>
                ) : analyzers.length === 0 ? (
                  <option value="">Sin analizadores</option>
                ) : (
                  analyzers.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))
                )}
              </select>
            </label>

            <label className="flex items-center gap-1">
              <span className="text-gray-600">Período:</span>
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="rounded-md border border-gray-300 bg-white px-2 py-1"
              />
            </label>

            <button
              className="rounded-md border border-gray-300 bg-white px-2 py-1 hover:bg-gray-50"
              onClick={() => setSelectedMonth(prevMonth(selectedMonth))}
            >
              ←
            </button>
            <button
              className="rounded-md border border-gray-300 bg-white px-2 py-1 hover:bg-gray-50"
              onClick={() => setSelectedMonth(thisMonth)}
            >
              Actual
            </button>
            <button
              className="rounded-md border border-gray-300 bg-white px-2 py-1 hover:bg-gray-50"
              onClick={() => setSelectedMonth(nextMonth(selectedMonth))}
            >
              →
            </button>
          </div>
        </div>
      </div>

      {analyzersError ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {analyzersError}
        </div>
      ) : null}

      {histError ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {histError}
        </div>
      ) : null}

      {exceedsContract && peakKw && contractedKw !== null ? (
        <div className="rounded-md border border-red-300 bg-red-50 px-4 py-3">
          <div className="text-sm font-semibold text-red-800">Alerta de potencia</div>
          <div className="text-sm text-red-700">
            La potencia pico registrada fue de <b>{fmt(peakKw.kw, 2, " kW")}</b> el día{" "}
            <b>{peakKw.date}</b> y supera la potencia contratada de{" "}
            <b>{fmt(contractedKw, 2, " kW")}</b>.
          </div>
        </div>
      ) : null}

      <div className="rounded-md border border-gray-400 bg-white overflow-hidden">
        <div className="border-b border-gray-400 bg-[#e9e4da] px-3 py-2 text-sm font-semibold text-gray-900">
          Período de lecturas
        </div>

        <div className="grid gap-0 md:grid-cols-2">
          <div className="border-b border-r border-gray-300 p-3 md:border-b-0">
            <div className="mb-2 text-sm font-semibold text-gray-900">Capacidades de suministro</div>
            <div className="grid grid-cols-2 gap-2">
              <ValueBox
                label="Potencia contratada"
                value={fmt(contractedKw, 2, " kW")}
                subtext={currentAnalyzer?.location_name ?? currentAnalyzer?.name ?? ""}
              />
              <ValueBox
                label="Potencia pico registrada"
                value={peakKw ? fmt(peakKw.kw, 2, " kW") : "--"}
                subtext={peakKw ? `Fecha pico: ${peakKw.date}` : "Sin datos"}
                danger={exceedsContract}
              />
            </div>
          </div>

          <div className="border-b border-gray-300 p-3">
            <div className="mb-2 text-sm font-semibold text-gray-900">Energías activas</div>
            <div className="grid grid-cols-2 gap-2">
              <ValueBox
                label="Registrada período actual"
                value={fmtInt(activeEnergyKwh, " kWh")}
                subtext="Consumo del período"
              />
              <ValueBox
                label="Promedio diario"
                value={fmt(avgDailyKwh, 2, " kWh")}
                subtext="Promedio del mes"
              />
            </div>
          </div>
        </div>

        <div className="border-b border-gray-300 p-3">
          <div className="mb-2 text-sm font-semibold text-gray-900">Potencia reactiva y factor de potencia</div>
          <div className="grid gap-2 sm:grid-cols-3">
            <ValueBox
              label="Reactiva promedio"
              value={fmt(reactiveKvarAvgMonth, 2, " kVAr")}
            />
            <ValueBox
              label="Reactiva máxima"
              value={fmt(reactiveKvarMaxMonth, 2, " kVAr")}
            />
            <ValueBox
              label="Factor de potencia promedio"
              value={fmtPf(pfAvgMonth, 3)}
              danger={pfAvgMonth !== null && pfAvgMonth < PF_REF}
            />
          </div>
        </div>

        <div className="p-3">
          <div className="mb-2 text-sm font-semibold text-gray-900">Histórico del período</div>

          <div className="h-80">
            {loadingHist ? (
              <div className="flex h-full items-center justify-center text-sm text-gray-500">
                Cargando histórico…
              </div>
            ) : monthChartData.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-gray-500">
                Sin datos para el período.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthChartData} margin={{ top: 26, right: 24, left: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="day" />
                  <YAxis />
                  <Tooltip content={monthTooltip} />

                  <Bar dataKey="kwh" name="kWh">
                    {monthChartData.map((row, idx) => (
                      <Cell key={idx} fill={row.lowPf ? "#ef4444" : "#9ca3af"} />
                    ))}
                    <LabelList
                      dataKey="kwhLabel"
                      position="top"
                      style={{ fontSize: 11, fill: "#6b7280" }}
                    />
                  </Bar>

                  <ReferenceLine
                    y={avgDailyKwh ?? undefined}
                    stroke="#6b7280"
                    strokeDasharray="6 4"
                    label={{
                      value: `Promedio ${fmt(avgDailyKwh, 2, " kWh")}`,
                      position: "insideTopRight",
                      fontSize: 11,
                    }}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="mt-2 flex flex-wrap gap-4 text-xs text-gray-600">
            <div className="flex items-center gap-2">
              <span className="inline-block h-3 w-3 rounded-sm bg-[#9ca3af]" />
              Consumo normal
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-block h-3 w-3 rounded-sm bg-[#ef4444]" />
              Día con factor de potencia bajo
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}