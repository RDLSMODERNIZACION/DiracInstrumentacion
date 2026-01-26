import React, { useMemo } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  ReferenceLine,
} from "recharts";

type MaybeNum = number | string | null | undefined;

export type PumpsTs = {
  timestamps?: MaybeNum[];
  is_on?: (number | boolean | string | null)[];
} | null;

function toMs(x: MaybeNum): number {
  if (typeof x === "number") return x > 2_000_000_000 ? x : x * 1000;
  if (typeof x === "string") {
    const n = Number(x);
    if (Number.isFinite(n)) return n > 2_000_000_000 ? n : n * 1000;
    const t = Date.parse(x);
    if (Number.isFinite(t)) return t;
  }
  return NaN;
}

function coerceOn(x: any): number {
  if (x === true) return 1;
  if (x === false || x == null) return 0;
  const n = Number(x);
  if (Number.isFinite(n)) return n;
  return 0;
}

function fmtTime(ms: number, tz: string) {
  try {
    return new Intl.DateTimeFormat("es-AR", {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(ms);
  } catch {
    const d = new Date(ms);
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
  }
}

export default function OpsPumpsProfile({
  pumpsTs,
  comparePumpsTs,
  compareLabel = "Auditoría",
  max,
  syncId,
  title = "Bombas ON",
  tz,
  xDomain,
  xTicks,
  hoverX,
  onHoverX,
}: {
  pumpsTs?: PumpsTs;
  comparePumpsTs?: PumpsTs;
  compareLabel?: string;
  max?: number;
  syncId?: string;
  title?: string;
  tz: string;
  xDomain?: [number, number];
  xTicks?: number[];
  hoverX?: number | null;
  onHoverX?: (x: number | null) => void;
}) {
  const data = useMemo(() => {
    const t = pumpsTs?.timestamps ?? [];
    const v = pumpsTs?.is_on ?? [];
    const n = Math.min(t.length, v.length);
    const rows: { ms: number; on: number | null }[] = [];
    for (let i = 0; i < n; i++) {
      const ms = toMs(t[i]);
      if (!Number.isFinite(ms)) continue;
      rows.push({ ms, on: coerceOn(v[i]) });
    }
    return rows;
  }, [pumpsTs]);

  const dataCmp = useMemo(() => {
    if (!comparePumpsTs) return null;
    const t = comparePumpsTs.timestamps ?? [];
    const v = comparePumpsTs.is_on ?? [];
    const n = Math.min(t.length, v.length);
    const rows: { ms: number; on_cmp: number | null }[] = [];
    for (let i = 0; i < n; i++) {
      const ms = toMs(t[i]);
      if (!Number.isFinite(ms)) continue;
      rows.push({ ms, on_cmp: coerceOn(v[i]) });
    }
    return rows;
  }, [comparePumpsTs]);

  const merged = useMemo(() => {
    if (!dataCmp) return data;
    const map = new Map<number, { ms: number; on: number | null; on_cmp?: number | null }>();
    for (const r of data) map.set(r.ms, { ms: r.ms, on: r.on });
    for (const r of dataCmp) {
      const cur = map.get(r.ms);
      if (cur) cur.on_cmp = r.on_cmp;
      else map.set(r.ms, { ms: r.ms, on: null, on_cmp: r.on_cmp });
    }
    return Array.from(map.values()).sort((a, b) => a.ms - b.ms);
  }, [data, dataCmp]);

  const yMax = useMemo(() => {
    const local = Math.max(...data.map((d) => Number(d.on ?? 0)), 0);
    const cmp = Math.max(...(dataCmp ?? []).map((d) => Number((d as any).on_cmp ?? 0)), 0);
    return Math.max(max ?? 0, local, cmp, 1);
  }, [data, dataCmp, max]);

  return (
    <div className="rounded-2xl border p-2">
      <div className="text-sm text-gray-600 mb-1">{title}</div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={merged}
            syncId={syncId}
            onMouseMove={(e: any) => onHoverX && onHoverX(e?.activeLabel ?? null)}
            onMouseLeave={() => onHoverX && onHoverX(null)}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              type="number"
              dataKey="ms"
              domain={(xDomain as any) ?? ["auto", "auto"]}
              ticks={xTicks as any}
              tickFormatter={(ms: any) => (Number.isFinite(ms) ? fmtTime(ms as number, tz) : "")}
            />
            <YAxis domain={[0, yMax]} allowDecimals={false} />
            <Tooltip
              labelFormatter={(ms) => fmtTime(Number(ms), tz)}
              formatter={(v: any, name: any) => [String(v), name]}
            />
            <Legend />
           <Area
  type="stepAfter"
  dataKey="on"
  name="Bombas ON"
  stroke="#dc2626"        // 🔴 rojo fuerte
  fill="#fecaca"          // 🔴 rojo claro
  fillOpacity={0.35}
  strokeWidth={2}
  isAnimationActive={false}
  connectNulls
/>

            {dataCmp && (
              <Area
                type="stepAfter"s
                dataKey="on_cmp"
                name={`${compareLabel} (ON)`}
                fillOpacity={0.15}
                strokeWidth={2}
                strokeDasharray="5 5"
                isAnimationActive={false}
                connectNulls
              />
            )}
            {hoverX ? <ReferenceLine x={hoverX} strokeWidth={1} /> : null}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
