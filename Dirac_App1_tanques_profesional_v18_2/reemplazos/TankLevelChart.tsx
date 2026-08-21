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

function ProfessionalTooltip({
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
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-xl">
      <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
        {fmtDateTime(Number(label ?? row.ms), tz)}
      </div>

      <div className="mt-1.5 flex items-baseline justify-between gap-5">
        <span className="text-xs font-medium text-slate-500">Nivel promedio</span>
        <span className="text-lg font-bold text-slate-900">
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

  const stats = useMemo(() => {
    const valid = data
      .map((r) => r.level)
      .filter((v): v is number => typeof v === "number" && Number.isFinite(v));

    if (!valid.length) {
      return {
        average: null,
        current: null,
      };
    }

    return {
      average: valid.reduce((acc, v) => acc + v, 0) / valid.length,
      current: valid[valid.length - 1],
    };
  }, [data]);

  const hasData = data.some((r) => r.level !== null);

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
        <div className="min-w-0">
          <div className="truncate text-[15px] font-semibold text-slate-800">
            {title}
          </div>
          <div className="mt-1 text-xs text-slate-400">
            Nivel promedio del período seleccionado
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
            <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400">
              Actual
            </div>
            <div className="mt-0.5 text-lg font-bold leading-none text-slate-700">
              {fmtPct(stats.current)}
            </div>
          </div>

          <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2">
            <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-blue-500">
              Promedio
            </div>
            <div className="mt-0.5 text-2xl font-extrabold leading-none tracking-tight text-blue-700">
              {fmtPct(stats.average)}
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-slate-100 px-3 pb-3 pt-2">
        <div className="h-[320px] rounded-xl bg-white">
          {!hasData ? (
            <div className="flex h-full items-center justify-center text-sm text-slate-400">
              Sin datos de nivel para el filtro actual.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={data}
                syncId={syncId}
                margin={{ top: 16, right: 18, bottom: 8, left: 0 }}
                onMouseMove={(e: any) => {
                  if (!onHoverX) return;
                  const x = Number(e?.activeLabel);
                  onHoverX(Number.isFinite(x) ? x : null);
                }}
                onMouseLeave={() => onHoverX?.(null)}
              >
                <defs>
                  <linearGradient id="tankProfessionalFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2563eb" stopOpacity={0.14} />
                    <stop offset="100%" stopColor="#2563eb" stopOpacity={0.01} />
                  </linearGradient>
                </defs>

                <CartesianGrid
                  stroke="#e7edf4"
                  strokeDasharray="3 5"
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
                  tick={{ fontSize: 11, fill: "#64748b", fontWeight: 500 }}
                  axisLine={{ stroke: "#dbe3ec" }}
                  tickLine={false}
                  dy={6}
                />

                <YAxis
                  domain={[0, 100]}
                  ticks={[0, 25, 50, 75, 100]}
                  tickFormatter={(n: any) => `${Number(n).toFixed(0)}%`}
                  tick={{ fontSize: 11, fill: "#64748b", fontWeight: 500 }}
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
                    <ProfessionalTooltip {...props} tz={tz} />
                  )}
                />

                {stats.average !== null && (
                  <ReferenceLine
                    y={stats.average}
                    stroke="#94a3b8"
                    strokeDasharray="6 6"
                    strokeWidth={1.2}
                  />
                )}

                <Area
                  type="monotone"
                  dataKey="level"
                  name="Nivel promedio"
                  stroke="#2563eb"
                  strokeWidth={3}
                  fill="url(#tankProfessionalFill)"
                  dot={false}
                  activeDot={{
                    r: 4.5,
                    strokeWidth: 2.5,
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

        <div className="flex items-center justify-end gap-4 px-2 pb-1 pt-1.5 text-[10px] font-medium text-slate-400">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-[2px] w-5 rounded bg-blue-600" />
            Nivel promedio
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-5 border-t border-dashed border-slate-400" />
            Promedio del período
          </span>
        </div>
      </div>
    </div>
  );
}
