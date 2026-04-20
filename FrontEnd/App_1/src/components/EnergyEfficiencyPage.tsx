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
  areaId?: number;
  companyId?: number;
  analyzerId?: number;
  locationId?: number;
};

type EnergyAreaOption = {
  id: number;
  name: string;
  company_id?: number | null;
  contracted_power_kw?: number | null;
  active?: boolean;
  created_at?: string | null;
  locations_count?: number;
  analyzers_count?: number;
};

type EnergyAreaDetail = {
  area: {
    id: number;
    name: string;
    company_id?: number | null;
    contracted_power_kw?: number | null;
    active?: boolean;
    created_at?: string | null;
  };
  locations: Array<{
    id: number;
    name: string;
    area_id: number | null;
  }>;
  analyzers: Array<{
    id: number;
    name: string;
    location_id: number | null;
  }>;
};

type AreaDailyRow = {
  day: string;
  max_kw: number | null;
  avg_kw: number | null;
  kwh_est: number | null;
  avg_pf: number | null;
  min_pf?: number | null;
  reactive_kvar_avg?: number | null;
  reactive_kvar_max?: number | null;
  samples?: number | null;
};

type AreaMonthKpisResponse = {
  area_id: number;
  month: string;
  area: {
    id: number;
    name: string;
    company_id?: number | null;
    contracted_power_kw?: number | null;
    active?: boolean;
    created_at?: string | null;
  };
  summary: {
    max_kw?: number | null;
    avg_kw?: number | null;
    kwh_est?: number | null;
    avg_pf?: number | null;
    reactive_kvar_avg?: number | null;
    reactive_kvar_max?: number | null;
    samples?: number | null;
    contracted_power_kw?: number | null;
  };
  daily: AreaDailyRow[];
  hourly?: any[];
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
  if (abs === 0 || abs > 1) return null;
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

const PF_REF = 0.96;

async function fetchEnergyAreas(
  companyId?: number,
  signal?: AbortSignal
): Promise<EnergyAreaOption[]> {
  const root = getApiRoot();
  const qs = new URLSearchParams();
  if (companyId != null) qs.set("company_id", String(companyId));
  const url = `${root}/energy_areas${qs.toString() ? `?${qs.toString()}` : ""}`;

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

async function fetchEnergyAreaDetail(areaId: number, signal?: AbortSignal): Promise<EnergyAreaDetail> {
  const root = getApiRoot();
  const url = `${root}/energy_areas/${areaId}`;

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

  return await r.json();
}

async function fetchAreaMonthKpis(
  areaId: number,
  month: string,
  signal?: AbortSignal
): Promise<AreaMonthKpisResponse> {
  const root = getApiRoot();
  const url = `${root}/energy_areas/${areaId}/month_kpis?month=${encodeURIComponent(month)}`;

  const r = await fetch(url, {
    method: "GET",
    headers: getApiHeaders({ "Content-Type": undefined as any }),
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
  areaId: initialAreaId,
  companyId,
}: Props) {
  const today = useMemo(() => isoDate(new Date()), []);
  const thisMonth = useMemo(() => today.slice(0, 7), [today]);

  const [selectedAreaId, setSelectedAreaId] = useState<number | null>(initialAreaId ?? null);
  const [selectedMonth, setSelectedMonth] = useState<string>(thisMonth);

  const [areas, setAreas] = useState<EnergyAreaOption[]>([]);
  const [areaDetail, setAreaDetail] = useState<EnergyAreaDetail | null>(null);
  const [monthData, setMonthData] = useState<AreaMonthKpisResponse | null>(null);

  const [loadingAreas, setLoadingAreas] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [loadingMonth, setLoadingMonth] = useState(false);

  const [areasError, setAreasError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [monthError, setMonthError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const ctrl = new AbortController();

    async function run() {
      try {
        setLoadingAreas(true);
        setAreasError(null);

        const rows = await fetchEnergyAreas(companyId, ctrl.signal);
        if (!alive) return;

        setAreas(rows);

        if (!rows.length) {
          setSelectedAreaId(null);
          setAreaDetail(null);
          setMonthData(null);
          return;
        }

        const exists = rows.some((a) => a.id === selectedAreaId);
        if (!exists) {
          setSelectedAreaId(rows[0].id);
        }
      } catch (e: any) {
        if (!alive) return;
        setAreas([]);
        setAreaDetail(null);
        setMonthData(null);
        setAreasError(e?.message ?? String(e));
      } finally {
        if (!alive) return;
        setLoadingAreas(false);
      }
    }

    run();
    return () => {
      alive = false;
      ctrl.abort();
    };
  }, [companyId]);

  useEffect(() => {
    if (!selectedAreaId) {
      setAreaDetail(null);
      setDetailError(null);
      return;
    }

    let alive = true;
    const ctrl = new AbortController();

    async function run() {
      try {
        setLoadingDetail(true);
        setDetailError(null);
        const json = await fetchEnergyAreaDetail(selectedAreaId, ctrl.signal);
        if (!alive) return;
        setAreaDetail(json);
      } catch (e: any) {
        if (!alive) return;
        setAreaDetail(null);
        setDetailError(e?.message ?? String(e));
      } finally {
        if (!alive) return;
        setLoadingDetail(false);
      }
    }

    run();
    return () => {
      alive = false;
      ctrl.abort();
    };
  }, [selectedAreaId]);

  useEffect(() => {
    if (!selectedAreaId) {
      setMonthData(null);
      setMonthError(null);
      return;
    }

    let alive = true;
    const ctrl = new AbortController();

    async function run() {
      try {
        setLoadingMonth(true);
        setMonthError(null);
        setMonthData(null);

        const json = await fetchAreaMonthKpis(selectedAreaId, selectedMonth, ctrl.signal);
        if (!alive) return;
        setMonthData(json);
      } catch (e: any) {
        if (!alive) return;
        setMonthData(null);
        if (String(e?.message).includes("SIN_HISTORIA")) setMonthError("Sin histórico para ese período.");
        else setMonthError(e?.message ?? String(e));
      } finally {
        if (!alive) return;
        setLoadingMonth(false);
      }
    }

    run();
    return () => {
      alive = false;
      ctrl.abort();
    };
  }, [selectedAreaId, selectedMonth]);

  const currentArea = useMemo(() => {
    return areas.find((a) => a.id === selectedAreaId) ?? null;
  }, [areas, selectedAreaId]);

  const locationsInArea = areaDetail?.locations ?? [];
  const analyzersInArea = areaDetail?.analyzers ?? [];
  const dailyRows = monthData?.daily ?? [];

  const contractedKw = useMemo(() => {
    return (
      toNum(monthData?.summary?.contracted_power_kw) ??
      toNum(areaDetail?.area?.contracted_power_kw) ??
      toNum(currentArea?.contracted_power_kw)
    );
  }, [monthData, areaDetail, currentArea]);

  const activeEnergyKwh = useMemo(() => {
    return toNum(monthData?.summary?.kwh_est);
  }, [monthData]);

  const avgDailyKwh = useMemo(() => {
    const vals = dailyRows.map((r) => toNum(r.kwh_est)).filter((x): x is number => typeof x === "number");
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  }, [dailyRows]);

  const reactiveKvarAvgMonth = useMemo(() => {
    return toNum(monthData?.summary?.reactive_kvar_avg);
  }, [monthData]);

  const reactiveKvarMaxMonth = useMemo(() => {
    return toNum(monthData?.summary?.reactive_kvar_max);
  }, [monthData]);

  const pfAvgMonth = useMemo(() => {
    return normalizePf(monthData?.summary?.avg_pf);
  }, [monthData]);

  const peakKw = useMemo(() => {
    const summaryMax = toNum(monthData?.summary?.max_kw);
    if (summaryMax != null) {
      let bestDate: string | null = null;
      let bestVal = summaryMax;

      for (const r of dailyRows) {
        const dayMax = toNum(r.max_kw);
        if (dayMax != null && Math.abs(dayMax - summaryMax) < 0.0001) {
          bestDate = String(r.day).slice(0, 10);
          break;
        }
      }

      return { date: bestDate, kw: bestVal };
    }

    let best: { date: string | null; kw: number } | null = null;
    for (const r of dailyRows) {
      const kw = toNum(r.max_kw);
      if (kw == null) continue;
      if (!best || kw > best.kw) best = { date: String(r.day).slice(0, 10), kw };
    }
    return best;
  }, [monthData, dailyRows]);

  const exceedsContract = useMemo(() => {
    if (contractedKw == null || !peakKw?.kw) return false;
    return peakKw.kw > contractedKw;
  }, [contractedKw, peakKw]);

  const monthChartData = useMemo(() => {
    return dailyRows
      .map((r) => {
        const pfAvg = normalizePf(r.avg_pf);
        const lowPf = typeof pfAvg === "number" && pfAvg < PF_REF;

        return {
          day: String(r.day).slice(8, 10),
          date: String(r.day).slice(0, 10),
          kwh: toNum(r.kwh_est) ?? undefined,
          kwhLabel: fmtBarValue(r.kwh_est),
          kw_max: toNum(r.max_kw) ?? undefined,
          q_kvar_avg: toNum(r.reactive_kvar_avg) ?? undefined,
          q_kvar_max: toNum(r.reactive_kvar_max) ?? undefined,
          pf_avg: pfAvg ?? undefined,
          pf_min: normalizePf(r.min_pf) ?? undefined,
          lowPf,
        };
      })
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [dailyRows]);

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
        {d?.lowPf ? <div className="mt-1 text-red-700">PF promedio bajo detectado</div> : null}
      </div>
    );
  };

  if (!loadingAreas && !areasError && areas.length === 0) {
    return (
      <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-4 text-sm text-amber-800">
        No hay áreas energéticas configuradas.
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
              <span className="text-gray-600">Área:</span>
              <select
                value={selectedAreaId ?? ""}
                onChange={(e) => setSelectedAreaId(e.target.value ? Number(e.target.value) : null)}
                className="rounded-md border border-gray-300 bg-white px-2 py-1"
                disabled={loadingAreas || areas.length === 0}
              >
                {loadingAreas ? (
                  <option value="">Cargando...</option>
                ) : areas.length === 0 ? (
                  <option value="">Sin áreas</option>
                ) : (
                  areas.map((a) => (
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
                disabled={!selectedAreaId}
              />
            </label>

            <button
              className="rounded-md border border-gray-300 bg-white px-2 py-1 hover:bg-gray-50 disabled:opacity-50"
              onClick={() => setSelectedMonth(prevMonth(selectedMonth))}
              disabled={!selectedAreaId}
            >
              ←
            </button>
            <button
              className="rounded-md border border-gray-300 bg-white px-2 py-1 hover:bg-gray-50 disabled:opacity-50"
              onClick={() => setSelectedMonth(thisMonth)}
              disabled={!selectedAreaId}
            >
              Actual
            </button>
            <button
              className="rounded-md border border-gray-300 bg-white px-2 py-1 hover:bg-gray-50 disabled:opacity-50"
              onClick={() => setSelectedMonth(nextMonth(selectedMonth))}
              disabled={!selectedAreaId}
            >
              →
            </button>
          </div>
        </div>

        {currentArea && (
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            <div className="rounded-md border border-gray-300 bg-white px-3 py-2">
              <div className="text-[11px] text-gray-600">Localidades del área</div>
              <div className="mt-1 flex flex-wrap gap-1">
                {loadingDetail ? (
                  <span className="text-xs text-gray-500">Cargando localidades...</span>
                ) : locationsInArea.length ? (
                  locationsInArea.map((l) => (
                    <span
                      key={l.id}
                      className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[11px] text-gray-700"
                    >
                      {l.name}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-gray-500">Sin localidades en el área.</span>
                )}
              </div>
            </div>

            <div className="rounded-md border border-gray-300 bg-white px-3 py-2">
              <div className="text-[11px] text-gray-600">Analizadores incluidos</div>
              <div className="mt-1 flex flex-wrap gap-1">
                {loadingDetail ? (
                  <span className="text-xs text-gray-500">Cargando analizadores...</span>
                ) : analyzersInArea.length ? (
                  analyzersInArea.map((a) => (
                    <span
                      key={a.id}
                      className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[11px] text-gray-700"
                    >
                      {a.name}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-gray-500">Sin analizadores en el área.</span>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {areasError ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {areasError}
        </div>
      ) : null}

      {detailError ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {detailError}
        </div>
      ) : null}

      {monthError ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {monthError}
        </div>
      ) : null}

      {exceedsContract && peakKw && contractedKw !== null ? (
        <div className="rounded-md border border-red-300 bg-red-50 px-4 py-3">
          <div className="text-sm font-semibold text-red-800">Alerta de potencia</div>
          <div className="text-sm text-red-700">
            La potencia pico registrada fue de <b>{fmt(peakKw.kw, 2, " kW")}</b>
            {peakKw.date ? (
              <>
                {" "}el día <b>{peakKw.date}</b>
              </>
            ) : null}{" "}
            y supera la potencia contratada del área de <b>{fmt(contractedKw, 2, " kW")}</b>.
          </div>
        </div>
      ) : null}

      <div className="rounded-md border border-gray-400 bg-white overflow-hidden">
        <div className="border-b border-gray-400 bg-[#e9e4da] px-3 py-2 text-sm font-semibold text-gray-900">
          Período de lecturas del área
        </div>

        <div className="grid gap-0 md:grid-cols-2">
          <div className="border-b border-r border-gray-300 p-3 md:border-b-0">
            <div className="mb-2 text-sm font-semibold text-gray-900">Capacidades de suministro</div>
            <div className="grid grid-cols-2 gap-2">
              <ValueBox
                label="Potencia contratada"
                value={fmt(contractedKw, 2, " kW")}
                subtext={currentArea?.name ?? ""}
              />
              <ValueBox
                label="Potencia pico registrada"
                value={peakKw ? fmt(peakKw.kw, 2, " kW") : "--"}
                subtext={peakKw?.date ? `Fecha pico: ${peakKw.date}` : "Sin datos"}
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
                subtext="Consumo del área"
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
            {loadingMonth ? (
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
              Día con PF promedio bajo
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}