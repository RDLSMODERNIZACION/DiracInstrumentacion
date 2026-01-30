import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from "recharts";

import { getApiRoot, getApiHeaders } from "@/lib/config";

type Props = {
  analyzerId?: number;
};

type LatestReading = {
  id: number;
  analyzer_id: number | null;
  ts: string | null;

  p_kw: number | null;
  pf: number | null;

  source?: string | null;
};

type LivePoint = {
  t: string;
  kw: number;
  pf: number | null;
};

function toNum(v: any): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "string" ? Number(v.replace(",", ".")) : Number(v);
  return Number.isFinite(n) ? n : null;
}

function fmt(v: any, decimals = 2, unit = ""): string {
  const n = toNum(v);
  if (n === null) return `--${unit}`;
  return `${n.toFixed(decimals)}${unit}`;
}

function fmt1(v: any, unit = ""): string {
  const n = toNum(v);
  if (n === null) return `--${unit}`;
  return `${n.toFixed(1)}${unit}`;
}

function absKw(v: any): number | null {
  const n = toNum(v);
  if (n === null) return null;
  return Math.abs(n);
}

async function fetchLatestNoScope(
  analyzerId: number,
  signal?: AbortSignal
): Promise<LatestReading> {
  const root = getApiRoot();
  const url = `${root}/components/network_analyzers/${analyzerId}/latest`;

  const r = await fetch(url, {
    method: "GET",
    headers: getApiHeaders({ "Content-Type": undefined as any }),
    cache: "no-store",
    signal,
  });

  if (r.status === 404) {
    throw new Error("SIN_LECTURAS");
  }

  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`${r.status} ${r.statusText}${txt ? ` - ${txt}` : ""}`);
  }

  return (await r.json()) as LatestReading;
}

export default function EnergyEfficiencyPage({
  analyzerId: initialAnalyzerId = 1,
}: Props) {
  const [analyzerId, setAnalyzerId] = useState<number>(initialAnalyzerId);
  const [latest, setLatest] = useState<LatestReading | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [series, setSeries] = useState<LivePoint[]>([]);
  const lastMsRef = useRef<number | null>(null);

  // polling live
  useEffect(() => {
    let alive = true;
    const ctrl = new AbortController();
    let t: any;

    async function tick() {
      try {
        const row = await fetchLatestNoScope(analyzerId, ctrl.signal);
        if (!alive) return;

        setLatest(row);
        setError(null);

        const ts = row.ts ?? new Date().toISOString();
        const ms = Date.parse(ts);

        const kw = absKw(row.p_kw) ?? 0;
        const pf = toNum(row.pf);

        setSeries((prev) => {
          const next = [...prev, { t: ts, kw, pf }];
          if (next.length > 300) next.splice(0, next.length - 300); // ~10 min
          return next;
        });

        if (Number.isFinite(ms)) lastMsRef.current = ms;
      } catch (e: any) {
        if (!alive) return;
        if (String(e?.message).includes("SIN_LECTURAS")) {
          setLatest(null);
          setError("Sin lecturas todavía (mandá datos al analizador).");
        } else {
          setError(e?.message ?? String(e));
        }
      } finally {
        if (!alive) return;
        t = setTimeout(tick, 2000);
      }
    }

    tick();
    return () => {
      alive = false;
      ctrl.abort();
      if (t) clearTimeout(t);
    };
  }, [analyzerId]);

  const chartData = useMemo(
    () =>
      series.map((p) => ({
        t: p.t.slice(11, 19),
        kw: p.kw,
        pf: p.pf ?? undefined,
      })),
    [series]
  );

  const kwNow = useMemo(() => absKw(latest?.p_kw), [latest?.p_kw]);
  const pfNow = useMemo(() => toNum(latest?.pf), [latest?.pf]);

  const kwMax = useMemo(() => {
    if (!series.length) return null;
    return series.reduce((m, p) => Math.max(m, p.kw), 0);
  }, [series]);

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
        <div>
          <div className="text-sm font-medium text-gray-700">
            Eficiencia Energética (LIVE)
          </div>
          <div className="text-xs text-gray-500">
            Lecturas directas del ABB (p_kw / PF).
          </div>
        </div>

        <div className="flex gap-2 items-center text-xs">
          <label className="flex items-center gap-1">
            <span className="text-gray-500">Analizador:</span>
            <select
              value={analyzerId}
              onChange={(e) => {
                setAnalyzerId(Number(e.target.value));
                setSeries([]);
                setLatest(null);
                setError(null);
                lastMsRef.current = null;
              }}
              className="border rounded-md px-2 py-1 text-xs bg-white"
            >
              <option value={1}>ABB #1</option>
              <option value={2}>ABB #2</option>
              <option value={3}>ABB #3</option>
              <option value={4}>ABB #4</option>
            </select>
          </label>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="border rounded-2xl bg-white p-3">
          <div className="text-[11px] text-gray-500">kW ahora</div>
          <div className="text-xl font-semibold">{fmt1(kwNow, " kW")}</div>
          <div className="text-[11px] text-gray-400">
            src: {latest?.source ?? "--"}
          </div>
        </div>

        <div className="border rounded-2xl bg-white p-3">
          <div className="text-[11px] text-gray-500">kW pico (buffer)</div>
          <div className="text-xl font-semibold">{fmt1(kwMax, " kW")}</div>
          <div className="text-[11px] text-gray-400">
            últimos {series.length} pts
          </div>
        </div>

        <div className="border rounded-2xl bg-white p-3">
          <div className="text-[11px] text-gray-500">PF actual</div>
          <div className="text-xl font-semibold">{fmt(pfNow, 3)}</div>
          <div className="text-[11px] text-gray-400">factor de potencia</div>
        </div>

        <div className="border rounded-2xl bg-white p-3">
          <div className="text-[11px] text-gray-500">Estado</div>
          <div className="text-sm font-medium">
            {error ? (
              <span className="text-amber-600">{error}</span>
            ) : (
              <span className="text-green-600">OK</span>
            )}
          </div>
        </div>
      </div>

      {/* Gráfico */}
      <div className="h-64 border rounded-2xl bg-white p-2">
        {chartData.length === 0 ? (
          <div className="h-full flex items-center justify-center text-sm text-gray-500">
            Sin datos aún.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="t" hide />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line
                type="monotone"
                dataKey="kw"
                name="abs(kW)"
                dot={false}
                strokeWidth={2}
              />
              <Line
                type="monotone"
                dataKey="pf"
                name="PF"
                dot={false}
                strokeWidth={2}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
