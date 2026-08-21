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
} from "recharts";

type MaybeNum = number | string | null | undefined;

export type TankTs = {
  timestamps?: MaybeNum[];
  level_percent?: MaybeNum[];
  level_min?: MaybeNum[];
  level_max?: MaybeNum[];
} | null;

type Row = {
  ms: number;
  level: number | null;
};

function toMs(x: MaybeNum): number {
  if (typeof x === "number") {
    return x > 2_000_000_000 ? x : x * 1000;
  }

  if (typeof x === "string") {
    const n = Number(x);
    if (Number.isFinite(n)) return n > 2_000_000_000 ? n : n * 1000;

    const parsed = Date.parse(x);
    if (Number.isFinite(parsed)) return parsed;
  }

  return NaN;
}

function toNum(x: MaybeNum): number | null {
  if (x === null || x === undefined || x === "") return null;

  const n =
    typeof x === "string"
      ? Number(x.replace(",", "."))
      : Number(x);

  return Number.isFinite(n) ? n : null;
}

function clampPct(v: number | null): number | null {
  if (v === null) return null;
  return Math.max(0, Math.min(100, v));
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
    return `${String(d.getHours()).padStart(2, "0")}:${String(
      d.getMinutes()
    ).padStart(2, "0")}`;
  }
}

function fmtDateTime(ms: number, tz: string) {
  try {
    return new Intl.DateTimeFormat("es-AR", {
      timeZone: tz,
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(ms);
  } catch {
    return new Date(ms).toLocaleString();
  }
}

function fmtPct(v: number | null, decimals = 1) {
  return v === null ? "--" : `${v.toFixed(decimals)}%`;
}

function buildRows(ts?: TankTs): Row[] {
  const timestamps = ts?.timestamps ?? [];
  const values = ts?.level_percent ?? [];
  const n = Math.min(timestamps.length, values.length);

  const rows: Row[] = [];

  for (let i = 0; i < n; i++) {
    const ms = toMs(timestamps[i]);
    if (!Number.isFinite(ms)) continue;

    rows.push({
      ms,
      level: clampPct(toNum(values[i])),
    });
  }

  return rows.sort((a, b) => a.ms - b.ms);
}

function AverageTooltip({
  active,
  payload,
  label,
  tz,
}: {
  active?: boolean;
  payload?: any[];
  label?: any;
  tz: string;
}) {
  if (!active || !payload?.length) return null;

  const row = payload[0]?.payload as Row | undefined;
  if (!row) return null;

  return (
    <div className="min-w-[150px] rounded-2xl border border-slate-200 bg-white/95 px-4 py-3 shadow-xl backdrop-blur">
      <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
        {fmtDateTime(Number(label ?? row.ms), tz)}
      </div>

      <div className="mt-2 flex items-end justify-between gap-4">
        <span className="text-xs font-semibold text-slate-500">
          Nivel promedio
        </span>
        <span className="text-2xl font-black leading-none text-blue-700">
          {fmtPct(row.level)}
        </span>
      </div>
    </div>
  );
}

export default function TankLevelChart({
  ts,
  syncId,
  title = "Nivel de tanques",
  tz,
  xDomain,
  xTicks,
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
  showBrushIf?: number;
  lowPct?: number | null;
  lowLowPct?: number | null;
  highPct?: number | null;
  highHighPct?: number | null;
}) {
  const data = useMemo(() => buildRows(ts), [ts]);

  const average = useMemo(() => {
    const valid = data
      .map((r) => r.level)
      .filter((v): v is number => typeof v === "number" && Number.isFinite(v));

    if (!valid.length) return null;

    return valid.reduce((acc, v) => acc + v, 0) / valid.length;
  }, [data]);

  const hasData = data.some((r) => r.level !== null);

  return (
    <div className="overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 px-5 py-4">
        <div>
          <div className="text-[15px] font-bold text-slate-800">{title}</div>
          <div className="mt-1 text-xs font-medium text-slate-400">
            Evolución del nivel promedio durante el período
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 to-sky-50 px-4 py-3 shadow-sm">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 shadow-sm">
            <svg
              width="18"
              height="22"
              viewBox="0 0 18 22"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M9 1.5C9 1.5 2.5 9.2 2.5 14.1C2.5 17.9 5.4 20.5 9 20.5C12.6 20.5 15.5 17.9 15.5 14.1C15.5 9.2 9 1.5 9 1.5Z"
                fill="white"
              />
            </svg>
          </div>

          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.14em] text-blue-500">
              Promedio
            </div>
            <div className="mt-0.5 text-[32px] font-black leading-none tracking-tight text-blue-700">
              {fmtPct(average)}
            </div>
          </div>
        </div>
      </div>

      <div className="px-3 pb-3 pt-2">
        <div className="h-[330px] rounded-2xl bg-gradient-to-b from-slate-50/80 to-white p-2">
          {!hasData ? (
            <div className="flex h-full items-center justify-center rounded-xl text-sm text-slate-400">
              Sin datos de nivel para el filtro actual.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={data}
                syncId={syncId}
                margin={{ top: 18, right: 18, bottom: 8, left: 0 }}
                onMouseMove={(e: any) => {
                  if (!onHoverX) return;
                  const x = Number(e?.activeLabel);
                  onHoverX(Number.isFinite(x) ? x : null);
                }}
                onMouseLeave={() => onHoverX?.(null)}
              >
                <defs>
                  <linearGradient id="tankAverageFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.24} />
                    <stop offset="65%" stopColor="#60a5fa" stopOpacity={0.08} />
                    <stop offset="100%" stopColor="#93c5fd" stopOpacity={0.01} />
                  </linearGradient>
                </defs>

                <CartesianGrid
                  stroke="#e2e8f0"
                  strokeDasharray="4 5"
                  vertical={false}
                />

                <XAxis
                  type="number"
                  dataKey="ms"
                  domain={(xDomain as any) ?? ["dataMin", "dataMax"]}
                  ticks={xTicks as any}
                  tickFormatter={(ms: any) =>
                    Number.isFinite(Number(ms))
                      ? fmtTime(Number(ms), tz)
                      : ""
                  }
                  tick={{ fontSize: 11, fill: "#64748b", fontWeight: 600 }}
                  axisLine={{ stroke: "#cbd5e1" }}
                  tickLine={false}
                  dy={7}
                />

                <YAxis
                  domain={[0, 100]}
                  ticks={[0, 25, 50, 75, 100]}
                  tickFormatter={(n: any) => `${Number(n).toFixed(0)}%`}
                  tick={{ fontSize: 11, fill: "#64748b", fontWeight: 600 }}
                  axisLine={false}
                  tickLine={false}
                  width={44}
                />

                <Tooltip
                  cursor={{
                    stroke: "#94a3b8",
                    strokeDasharray: "4 4",
                    strokeWidth: 1,
                  }}
                  content={(props: any) => (
                    <AverageTooltip {...props} tz={tz} />
                  )}
                />

                {average !== null && (
                  <ReferenceLine
                    y={average}
                    stroke="#60a5fa"
                    strokeDasharray="5 5"
                    strokeWidth={1.5}
                    label={{
                      value: `Prom. ${average.toFixed(1)}%`,
                      position: "insideTopRight",
                      fill: "#2563eb",
                      fontSize: 11,
                      fontWeight: 700,
                    }}
                  />
                )}

                <Area
                  type="monotone"
                  dataKey="level"
                  name="Nivel promedio"
                  stroke="#2563eb"
                  strokeWidth={3.5}
                  fill="url(#tankAverageFill)"
                  dot={false}
                  activeDot={{
                    r: 5,
                    strokeWidth: 3,
                    stroke: "#ffffff",
                    fill: "#2563eb",
                  }}
                  connectNulls
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}
