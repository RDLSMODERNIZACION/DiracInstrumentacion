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
  Line,
  Legend,
  ComposedChart,
  Scatter,
} from "recharts";

import { getApiRoot, getApiHeaders } from "@/lib/config";

type Props = {
  areaId?: number;
  companyId?: number;
};

type EnergyAreaOption = {
  id: number;
  name: string;
  company_id?: number | null;
  contracted_power_kw?: number | null;
  active?: boolean;
};

type EnergyAreaDetail = {
  area: {
    id: number;
    name: string;
    company_id?: number | null;
    contracted_power_kw?: number | null;
    active?: boolean;
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
  kvarh_est?: number | null;
  kvah_est?: number | null;
  avg_pf: number | null;
  min_pf?: number | null;
  reactive_kvar_avg?: number | null;
  reactive_kvar_max?: number | null;
  apparent_kva_avg?: number | null;
  apparent_kva_max?: number | null;
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
  };
  summary: {
    max_kw?: number | null;
    avg_kw?: number | null;
    kwh_est?: number | null;
    period_kwh?: number | null;
    period_kvarh?: number | null;
    period_kvah?: number | null;
    kvarh_est?: number | null;
    kvah_est?: number | null;
    avg_pf?: number | null;
    min_pf?: number | null;
    reactive_kvar_avg?: number | null;
    reactive_kvar_max?: number | null;
    apparent_kva_avg?: number | null;
    apparent_kva_max?: number | null;
    samples?: number | null;
    contracted_power_kw?: number | null;
  };
  daily: AreaDailyRow[];
  hourly?: any[];
};

type AreaHistoryPoint = {
  ts: string;
  kwh_est?: number | null;
  kw_avg?: number | null;
  kw_max?: number | null;
  pf_avg?: number | null;
  pf_min?: number | null;
  q_kvar_avg?: number | null;
  q_kvar_max?: number | null;
  samples?: number | null;
};

type AreaHistoryResponse = {
  area_id: number;
  granularity: "minute" | "hour" | "day";
  from: string;
  to: string;
  area: {
    id: number;
    name: string;
    contracted_power_kw?: number | null;
  };
  points: AreaHistoryPoint[];
};

function toNum(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "string" ? Number(v.replace(",", ".")) : Number(v);
  return Number.isFinite(n) ? n : null;
}

function normalizePf(v: any): number | null {
  const n = toNum(v);
  if (n === null) return null;
  const abs = Math.abs(n);
  if (abs === 0 || abs > 1) return null;
  return abs;
}

function fmt(v: any, decimals = 2, unit = ""): string {
  const n = toNum(v);
  if (n === null) return `--${unit}`;
  return `${n.toFixed(decimals)}${unit}`;
}

function fmtInt(v: any, unit = ""): string {
  const n = toNum(v);
  if (n === null) return `--${unit}`;
  return `${Math.round(n).toLocaleString("es-AR")}${unit}`;
}

function fmtPf(v: any, decimals = 3): string {
  const n = normalizePf(v);
  if (n === null) return "--";
  return n.toFixed(decimals);
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

function addDays(dateStr: string, days: number) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

function hourLabelFromTs(ts?: string | null) {
  if (!ts) return "--";
  const s = String(ts);
  const m = s.match(/T(\d{2}):(\d{2})/);
  if (m) return `${m[1]}:${m[2]}`;
  return s.slice(11, 16) || "--";
}

const PF_REF = 0.96;

async function fetchEnergyAreas(companyId?: number, signal?: AbortSignal): Promise<EnergyAreaOption[]> {
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

async function fetchAreaMonthKpis(areaId: number, month: string, signal?: AbortSignal): Promise<AreaMonthKpisResponse> {
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

async function fetchAreaDayHistory(areaId: number, day: string, signal?: AbortSignal): Promise<AreaHistoryResponse> {
  const root = getApiRoot();
  const from = `${day}T00:00:00`;
  const to = `${addDays(day, 1)}T00:00:00`;

  const qs = new URLSearchParams({
    from,
    to,
    granularity: "hour",
  });

  const url = `${root}/energy_areas/${areaId}/history?${qs.toString()}`;

  const r = await fetch(url, {
    method: "GET",
    headers: getApiHeaders({ "Content-Type": undefined as any }),
    cache: "no-store",
    signal,
  });

  if (r.status === 404) {
    return {
      area_id: areaId,
      granularity: "hour",
      from,
      to,
      area: { id: areaId, name: "", contracted_power_kw: null },
      points: [],
    };
  }

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
    <div className={`rounded-md border px-3 py-3 ${danger ? "border-red-300 bg-red-50" : "border-gray-300 bg-white"}`}>
      <div className="text-[11px] text-gray-600">{label}</div>
      <div className={`mt-1 text-xl font-semibold ${danger ? "text-red-700" : "text-gray-900"}`}>{value}</div>
      {subtext ? <div className="mt-1 text-[11px] text-gray-500">{subtext}</div> : null}
    </div>
  );
}

export default function EnergyEfficiencyPage({ areaId: initialAreaId, companyId }: Props) {
  const today = useMemo(() => isoDate(new Date()), []);
  const thisMonth = useMemo(() => today.slice(0, 7), [today]);

  const [selectedAreaId, setSelectedAreaId] = useState<number | null>(initialAreaId ?? null);
  const [selectedMonth, setSelectedMonth] = useState<string>(thisMonth);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const [areas, setAreas] = useState<EnergyAreaOption[]>([]);
  const [areaDetail, setAreaDetail] = useState<EnergyAreaDetail | null>(null);
  const [monthData, setMonthData] = useState<AreaMonthKpisResponse | null>(null);
  const [dayHistory, setDayHistory] = useState<AreaHistoryResponse | null>(null);

  const [loadingAreas, setLoadingAreas] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [loadingMonth, setLoadingMonth] = useState(false);
  const [loadingDay, setLoadingDay] = useState(false);

  const [areasError, setAreasError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [monthError, setMonthError] = useState<string | null>(null);
  const [dayError, setDayError] = useState<string | null>(null);

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
          setDayHistory(null);
          setSelectedDay(null);
          setDetailOpen(false);
          return;
        }

        const exists = rows.some((a) => a.id === selectedAreaId);
        if (!exists) setSelectedAreaId(rows[0].id);
      } catch (e: any) {
        if (!alive) return;
        setAreas([]);
        setAreaDetail(null);
        setMonthData(null);
        setDayHistory(null);
        setSelectedDay(null);
        setDetailOpen(false);
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
      setSelectedDay(null);
      setDetailOpen(false);
      return;
    }

    let alive = true;
    const ctrl = new AbortController();

    async function run() {
      try {
        setLoadingMonth(true);
        setMonthError(null);
        setMonthData(null);
        setSelectedDay(null);
        setDayHistory(null);
        setDetailOpen(false);

        const json = await fetchAreaMonthKpis(selectedAreaId, selectedMonth, ctrl.signal);
        if (!alive) return;
        setMonthData(json);
      } catch (e: any) {
        if (!alive) return;
        setMonthData(null);
        setSelectedDay(null);
        setDetailOpen(false);
        if (String(e?.message).includes("SIN_HISTORIA")) {
          setMonthError("Sin histórico para ese período.");
        } else {
          setMonthError(e?.message ?? String(e));
        }
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

  useEffect(() => {
    if (!selectedAreaId || !selectedDay || !detailOpen) {
      setDayHistory(null);
      setDayError(null);
      return;
    }

    let alive = true;
    const ctrl = new AbortController();

    async function run() {
      try {
        setLoadingDay(true);
        setDayError(null);
        const json = await fetchAreaDayHistory(selectedAreaId, selectedDay, ctrl.signal);
        if (!alive) return;
        setDayHistory(json);
      } catch (e: any) {
        if (!alive) return;
        setDayHistory(null);
        setDayError(e?.message ?? String(e));
      } finally {
        if (!alive) return;
        setLoadingDay(false);
      }
    }

    run();
    return () => {
      alive = false;
      ctrl.abort();
    };
  }, [selectedAreaId, selectedDay, detailOpen]);

  const currentArea = useMemo(
    () => areas.find((a) => a.id === selectedAreaId) ?? null,
    [areas, selectedAreaId]
  );

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
    return toNum(monthData?.summary?.period_kwh) ?? toNum(monthData?.summary?.kwh_est);
  }, [monthData]);

  const reactiveEnergyKvarh = useMemo(() => {
    return toNum(monthData?.summary?.period_kvarh) ?? toNum(monthData?.summary?.kvarh_est);
  }, [monthData]);

  const apparentEnergyKvah = useMemo(() => {
    return toNum(monthData?.summary?.period_kvah) ?? toNum(monthData?.summary?.kvah_est);
  }, [monthData]);

  const avgDailyKwh = useMemo(() => {
    const vals = dailyRows.map((r) => toNum(r.kwh_est)).filter((x): x is number => x != null);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  }, [dailyRows]);

  const reactiveKvarAvgMonth = useMemo(() => toNum(monthData?.summary?.reactive_kvar_avg), [monthData]);
  const reactiveKvarMaxMonth = useMemo(() => toNum(monthData?.summary?.reactive_kvar_max), [monthData]);
  const avgKwMonth = useMemo(() => toNum(monthData?.summary?.avg_kw), [monthData]);
  const pfAvgMonth = useMemo(() => normalizePf(monthData?.summary?.avg_pf), [monthData]);

  const monthPeakDay = useMemo(() => {
    let best: { date: string; kw: number } | null = null;
    for (const r of dailyRows) {
      const kw = toNum(r.max_kw);
      if (kw == null) continue;
      const date = String(r.day).slice(0, 10);
      if (!best || kw > best.kw) best = { date, kw };
    }
    return best;
  }, [dailyRows]);

  const peakKw = useMemo(() => {
    const summaryMax = toNum(monthData?.summary?.max_kw);
    if (summaryMax != null) {
      let bestDate: string | null = null;
      for (const r of dailyRows) {
        const dayMax = toNum(r.max_kw);
        if (dayMax != null && Math.abs(dayMax - summaryMax) < 0.0001) {
          bestDate = String(r.day).slice(0, 10);
          break;
        }
      }
      return { date: bestDate, kw: summaryMax };
    }
    return monthPeakDay ? { date: monthPeakDay.date, kw: monthPeakDay.kw } : null;
  }, [monthData, dailyRows, monthPeakDay]);

  const exceedsContract = useMemo(() => {
    if (contractedKw == null || !peakKw?.kw) return false;
    return peakKw.kw > contractedKw;
  }, [contractedKw, peakKw]);

  const monthChartData = useMemo(() => {
    return dailyRows
      .map((r) => {
        const date = String(r.day).slice(0, 10);
        const pfAvg = normalizePf(r.avg_pf);
        const lowPf = typeof pfAvg === "number" && pfAvg < PF_REF;

        return {
          day: String(r.day).slice(8, 10),
          date,
          kwh: toNum(r.kwh_est) ?? undefined,
          kw_max: toNum(r.max_kw) ?? undefined,
          pf_avg: pfAvg ?? undefined,
          lowPf,
          isPeakDay: monthPeakDay?.date === date,
          isSelected: selectedDay === date && detailOpen,
          kwhLabel: fmtBarValue(r.kwh_est),
        };
      })
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [dailyRows, selectedDay, detailOpen, monthPeakDay]);

  const dayChartData = useMemo(() => {
    const pts = dayHistory?.points ?? [];
    return pts
      .map((p) => {
        const kwMax = toNum(p.kw_max);
        const kwAvg = toNum(p.kw_avg);
        return {
          ts: p.ts,
          hour: hourLabelFromTs(p.ts),
          kw_max: kwMax ?? undefined,
          kw_avg: kwAvg ?? undefined,
        };
      })
      .sort((a, b) => String(a.ts).localeCompare(String(b.ts)));
  }, [dayHistory]);

  const selectedDayPeak = useMemo(() => {
    let best: { ts: string; hour: string; kw: number } | null = null;
    for (const r of dayChartData) {
      const kw = toNum(r.kw_max);
      if (kw == null) continue;
      if (!best || kw > best.kw) best = { ts: r.ts, hour: r.hour, kw };
    }
    return best;
  }, [dayChartData]);

  const dayPeakScatter = useMemo(() => {
    if (!selectedDayPeak) return [];
    return [{ hour: selectedDayPeak.hour, peak_marker: selectedDayPeak.kw }];
  }, [selectedDayPeak]);

  const chartTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const d = payload[0]?.payload;
    return (
      <div className="rounded-md border bg-white px-3 py-2 text-xs shadow-sm">
        <div className="font-medium">{d?.date}</div>
        <div>Energía: {fmt(d?.kwh, 2, " kWh")}</div>
        <div>Pico: {fmt(d?.kw_max, 2, " kW")}</div>
        <div>cos φ promedio: {fmtPf(d?.pf_avg, 3)}</div>
        {d?.lowPf ? <div className="mt-1 text-red-700">PF promedio bajo</div> : null}
      </div>
    );
  };

  const dayTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;

    const avgItem = payload.find((p: any) => p?.dataKey === "kw_avg");
    const row = avgItem?.payload;

    return (
      <div className="rounded-md border bg-white px-3 py-2 text-xs shadow-sm">
        <div className="font-medium">
          {selectedDay ?? "--"} {label}
        </div>
        <div>kW promedio: {fmt(avgItem?.value, 2, " kW")}</div>
        <div>Máximo del día: {fmt(selectedDayPeak?.kw, 2, " kW")}</div>
        {row?.kw_max != null ? <div>kW máximo horario: {fmt(row.kw_max, 2, " kW")}</div> : null}
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

      {areasError ? <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">{areasError}</div> : null}
      {detailError ? <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">{detailError}</div> : null}
      {monthError ? <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">{monthError}</div> : null}
      {dayError ? <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">{dayError}</div> : null}

      {exceedsContract && peakKw && contractedKw !== null ? (
        <div className="rounded-md border border-red-300 bg-red-50 px-4 py-3">
          <div className="text-sm font-semibold text-red-800">Alerta de potencia</div>
          <div className="text-sm text-red-700">
            La potencia pico registrada fue de <b>{fmt(peakKw.kw, 2, " kW")}</b>
            {peakKw.date ? <> el día <b>{peakKw.date}</b></> : null} y supera la potencia contratada de{" "}
            <b>{fmt(contractedKw, 2, " kW")}</b>.
          </div>
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-3">
        <ValueBox label="Potencia contratada" value={fmt(contractedKw, 2, " kW")} subtext={currentArea?.name ?? ""} />
        <ValueBox
          label="Potencia pico"
          value={peakKw ? fmt(peakKw.kw, 2, " kW") : "--"}
          subtext={peakKw?.date ? `Fecha pico: ${peakKw.date}` : "Sin datos"}
          danger={exceedsContract}
        />
        <ValueBox label="Potencia promedio" value={fmt(avgKwMonth, 2, " kW")} subtext="Promedio del período" />
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <ValueBox label="Energía activa" value={fmtInt(activeEnergyKwh, " kWh")} subtext="Período actual" />
        <ValueBox label="Energía reactiva" value={fmtInt(reactiveEnergyKvarh, " kVArh")} subtext="Período actual" />
        <ValueBox label="Energía aparente" value={fmtInt(apparentEnergyKvah, " kVAh")} subtext="Período actual" />
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <ValueBox
          label="cos φ promedio"
          value={fmtPf(pfAvgMonth, 3)}
          subtext={`Referencia mínima ${PF_REF.toFixed(2)}`}
          danger={pfAvgMonth !== null && pfAvgMonth < PF_REF}
        />
        <ValueBox label="Reactiva promedio" value={fmt(reactiveKvarAvgMonth, 2, " kVAr")} />
        <ValueBox label="Reactiva máxima" value={fmt(reactiveKvarMaxMonth, 2, " kVAr")} />
      </div>

      <div className="rounded-md border border-gray-400 bg-white overflow-hidden">
        <div className="border-b border-gray-400 bg-[#e9e4da] px-3 py-2 text-sm font-semibold text-gray-900">
          Histórico diario del período
        </div>

        <div className="p-3">
          <div className="mb-2 text-xs text-gray-500">
            Borde dorado: día de mayor pico. Barras rojas: día con cos φ promedio bajo. Tocá una barra para abrir el detalle del día.
          </div>

          <div className="h-80">
            {loadingMonth ? (
              <div className="flex h-full items-center justify-center text-sm text-gray-500">Cargando histórico…</div>
            ) : monthChartData.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-gray-500">Sin datos para el período.</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthChartData} margin={{ top: 24, right: 24, left: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="day" />
                  <YAxis yAxisId="left" />
                  <YAxis yAxisId="right" orientation="right" />
                  <Tooltip content={chartTooltip} />
                  <Legend />

                  <Bar
                    yAxisId="left"
                    dataKey="kwh"
                    name="kWh/día"
                    onClick={(state: any) => {
                      const d = state?.payload?.date;
                      if (!d) return;
                      setSelectedDay(d);
                      setDetailOpen(true);
                    }}
                    cursor="pointer"
                  >
                    {monthChartData.map((row, idx) => (
                      <Cell
                        key={idx}
                        fill={row.isSelected ? "#111827" : row.lowPf ? "#ef4444" : "#9ca3af"}
                        stroke={row.isPeakDay ? "#f59e0b" : "none"}
                        strokeWidth={row.isPeakDay ? 3 : 0}
                      />
                    ))}
                    <LabelList dataKey="kwhLabel" position="top" style={{ fontSize: 10, fill: "#6b7280" }} />
                  </Bar>

                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="kw_max"
                    name="Pico kW"
                    stroke="#2563eb"
                    strokeWidth={2}
                    dot={false}
                  />

                  <ReferenceLine
                    yAxisId="left"
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
        </div>
      </div>

      {detailOpen ? (
        <div className="rounded-md border border-gray-400 bg-white overflow-hidden">
          <div className="border-b border-gray-400 bg-[#e9e4da] px-3 py-2 text-sm font-semibold text-gray-900">
            Detalle horario del día {selectedDay ?? "--"}
          </div>

          <div className="p-3">
            <div className="mb-3 flex items-center justify-between">
              <div className="grid gap-3 md:grid-cols-3 flex-1">
                <ValueBox label="Día" value={selectedDay ?? "--"} />
                <ValueBox label="Hora del máximo" value={selectedDayPeak?.hour ?? "--"} />
                <ValueBox label="Máximo del día" value={selectedDayPeak ? fmt(selectedDayPeak.kw, 2, " kW") : "--"} />
              </div>

              <button
                className="ml-3 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm hover:bg-gray-50"
                onClick={() => {
                  setDetailOpen(false);
                  setDayHistory(null);
                }}
              >
                Cerrar
              </button>
            </div>

            <div className="h-96">
              {loadingDay ? (
                <div className="flex h-full items-center justify-center text-sm text-gray-500">Cargando detalle horario…</div>
              ) : dayChartData.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-gray-500">
                  Sin datos horarios para el día seleccionado.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={dayChartData} margin={{ top: 24, right: 24, left: 8, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="hour" />
                    <YAxis yAxisId="left" />
                    <Tooltip content={dayTooltip} />
                    <Legend />

                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="kw_avg"
                      name="kW promedio"
                      stroke="#6b7280"
                      strokeWidth={2}
                      dot={{ r: 2 }}
                    />

                    <ReferenceLine
                      yAxisId="left"
                      x={selectedDayPeak?.hour}
                      stroke="#ef4444"
                      strokeDasharray="6 4"
                      label={{
                        value: selectedDayPeak ? `Hora pico ${selectedDayPeak.hour}` : "",
                        position: "insideTopRight",
                        fontSize: 11,
                      }}
                    />

                    <ReferenceLine
                      yAxisId="left"
                      y={selectedDayPeak?.kw ?? undefined}
                      stroke="#ef4444"
                      strokeDasharray="6 4"
                      label={{
                        value: selectedDayPeak ? `Máx ${fmt(selectedDayPeak.kw, 2, " kW")}` : "",
                        position: "insideTopLeft",
                        fontSize: 11,
                      }}
                    />

                    <Scatter
                      yAxisId="left"
                      name="Máximo"
                      data={dayPeakScatter}
                      dataKey="peak_marker"
                      fill="#ef4444"
                      shape="circle"
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}