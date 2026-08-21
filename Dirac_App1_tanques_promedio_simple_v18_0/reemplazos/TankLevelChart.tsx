import React, { useMemo } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
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
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-lg">
      <div className="text-[11px] font-medium text-slate-400">
        {fmtDateTime(Number(label ?? row.ms), tz)}
      </div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-xs font-semibold text-slate-500">Promedio</span>
        <span className="text-xl font-black text-slate-900">
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
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-start justify-between gap-4">
        <div>
          <div className="text-sm font-semibold text-slate-700">{title}</div>
          <div className="mt-1 text-xs text-slate-400">
            Nivel promedio del período seleccionado
          </div>
        </div>

        <div className="min-w-[118px] rounded-xl bg-blue-50 px-4 py-2 text-right">
          <div className="text-[10px] font-bold uppercase tracking-wide text-blue-500">
            Promedio
          </div>
          <div className="text-3xl font-black leading-none text-blue-700">
            {fmtPct(average)}
          </div>
        </div>
      </div>

      <div className="h-72">
        {!hasData ? (
          <div className="flex h-full items-center justify-center rounded-xl bg-slate-50 text-sm text-slate-400">
            Sin datos de nivel para el filtro actual.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={data}
              syncId={syncId}
              margin={{ top: 18, right: 18, bottom: 4, left: 0 }}
              onMouseMove={(e: any) => {
                if (!onHoverX) return;
                const x = Number(e?.activeLabel);
                onHoverX(Number.isFinite(x) ? x : null);
              }}
              onMouseLeave={() => onHoverX?.(null)}
            >
              <CartesianGrid
                stroke="#e5e7eb"
                strokeDasharray="3 3"
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
                tick={{ fontSize: 11, fill: "#64748b" }}
                axisLine={{ stroke: "#cbd5e1" }}
                tickLine={false}
              />

              <YAxis
                domain={[0, 100]}
                ticks={[0, 25, 50, 75, 100]}
                tickFormatter={(n: any) => `${Number(n).toFixed(0)}%`}
                tick={{ fontSize: 11, fill: "#64748b" }}
                axisLine={false}
                tickLine={false}
                width={42}
              />

              <Tooltip
                cursor={{ stroke: "#94a3b8", strokeDasharray: "4 4" }}
                content={(props: any) => (
                  <AverageTooltip {...props} tz={tz} />
                )}
              />

              <Line
                type="monotone"
                dataKey="level"
                name="Nivel promedio"
                stroke="#2563eb"
                strokeWidth={3}
                dot={false}
                activeDot={{
                  r: 5,
                  strokeWidth: 2,
                  stroke: "#ffffff",
                  fill: "#2563eb",
                }}
                connectNulls
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
