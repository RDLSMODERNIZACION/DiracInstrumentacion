import React, { useMemo } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Legend,
} from "recharts";

type MaybeNum = number | string | null | undefined;

export type TankTs = {
  timestamps?: MaybeNum[];
  level_percent?: MaybeNum[];
} | null;

function toMs(x: MaybeNum): number {
  if (typeof x === "number") return x > 2_000_000_000 ? x : x * 1000; // sec->ms heuristic
  if (typeof x === "string") {
    const n = Number(x);
    if (Number.isFinite(n)) return n > 2_000_000_000 ? n : n * 1000;
    const t = Date.parse(x);
    if (Number.isFinite(t)) return t;
  }
  return NaN;
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

export default function TankLevelChart({
  ts,
  compareTs,
  compareLabel = "Auditoría",
  syncId,
  title = "Nivel del tanque",
  tz,
  xDomain,
  xTicks,
  hoverX,
  onHoverX,
}: {
  ts?: TankTs;
  compareTs?: TankTs;
  compareLabel?: string;
  syncId?: string;
  title?: string;
  tz: string;
  xDomain?: [number, number];
  xTicks?: number[];
  hoverX?: number | null;
  onHoverX?: (x: number | null) => void;
}) {
  const data = useMemo(() => {
    const t = ts?.timestamps ?? [];
    const v = ts?.level_percent ?? [];
    const n = Math.min(t.length, v.length);
    const rows: { ms: number; level: number | null }[] = [];
    for (let i = 0; i < n; i++) {
      const ms = toMs(t[i]);
      const val = v[i] == null ? null : Number(v[i]);
      if (!Number.isFinite(ms)) continue;
      rows.push({ ms, level: Number.isFinite(val as number) ? (val as number) : null });
    }
    return rows;
  }, [ts]);

  const dataCmp = useMemo(() => {
    if (!compareTs) return null;
    const t = compareTs.timestamps ?? [];
    const v = compareTs.level_percent ?? [];
    const n = Math.min(t.length, v.length);
    const rows: { ms: number; level_cmp: number | null }[] = [];
    for (let i = 0; i < n; i++) {
      const ms = toMs(t[i]);
      const val = v[i] == null ? null : Number(v[i]);
      if (!Number.isFinite(ms)) continue;
      rows.push({ ms, level_cmp: Number.isFinite(val as number) ? (val as number) : null });
    }
    return rows;
  }, [compareTs]);

  const merged = useMemo(() => {
    if (!dataCmp) return data;
    const map = new Map<number, { ms: number; level: number | null; level_cmp?: number | null }>();
    for (const r of data) map.set(r.ms, { ms: r.ms, level: r.level });
    for (const r of dataCmp) {
      const cur = map.get(r.ms);
      if (cur) cur.level_cmp = r.level_cmp;
      else map.set(r.ms, { ms: r.ms, level: null, level_cmp: r.level_cmp });
    }
    return Array.from(map.values()).sort((a, b) => a.ms - b.ms);
  }, [data, dataCmp]);

  return (
    <div className="rounded-2xl border p-2">
      <div className="text-sm text-gray-600 mb-1">{title}</div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
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
            <YAxis domain={[0, 100]} tickFormatter={(n: any) => String(Number(n))} />
            <Tooltip
              labelFormatter={(ms) => fmtTime(Number(ms), tz)}
              formatter={(v: any, name: any) => [`${Number(v).toFixed(1)}%`, name]}
            />
            <Legend />
            <Area
              type="monotone"
              dataKey="level"
              name="Nivel (%)"
              fillOpacity={0.25}
              strokeWidth={2}
              isAnimationActive={false}
              connectNulls
            />
            {dataCmp && (
              <Area
                type="monotone"
                dataKey="level_cmp"
                name={`${compareLabel} (%)`}
                fillOpacity={0.15}
                strokeWidth={2}
                strokeDasharray="5 5"
                isAnimationActive={false}
                connectNulls
              />
            )}
            {hoverX ? <ReferenceLine x={hoverX} strokeWidth={1} /> : null}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
