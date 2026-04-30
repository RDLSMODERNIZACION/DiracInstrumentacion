import React, { useMemo } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ReferenceDot,
  Legend,
  Brush,
} from "recharts";

type MaybeNum = number | string | null | undefined;

export type TankTs = {
  timestamps?: MaybeNum[];

  /**
   * Serie principal.
   * En el backend nuevo viene desde level_avg, pero mantenemos
   * el nombre level_percent para compatibilidad con el front anterior.
   */
  level_percent?: MaybeNum[];

  /**
   * Nuevas series operativas.
   * level_min y level_max permiten dibujar la banda real mín/máx.
   */
  level_min?: MaybeNum[];
  level_max?: MaybeNum[];
} | null;

type ChartRow = {
  ms: number;
  level: number | null;
  levelMin: number | null;
  levelMax: number | null;
  bandBase: number | null;
  bandRange: number | null;
  levelCmp?: number | null;
};

function toMs(x: MaybeNum): number {
  if (typeof x === "number") {
    return x > 2_000_000_000 ? x : x * 1000;
  }

  if (typeof x === "string") {
    const n = Number(x);

    if (Number.isFinite(n)) {
      return n > 2_000_000_000 ? n : n * 1000;
    }

    const t = Date.parse(x);

    if (Number.isFinite(t)) {
      return t;
    }
  }

  return NaN;
}

function toNum(x: MaybeNum): number | null {
  if (x === null || x === undefined || x === "") return null;

  const n = typeof x === "string" ? Number(x.replace(",", ".")) : Number(x);

  return Number.isFinite(n) ? n : null;
}

function clampLevel(n: number | null): number | null {
  if (n === null) return null;
  return Math.max(0, Math.min(100, n));
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

function fmtLevel(v: MaybeNum, decimals = 1) {
  const n = toNum(v);
  if (n === null) return "--";
  return `${n.toFixed(decimals)}%`;
}

function lastValid(rows: ChartRow[], key: keyof ChartRow): number | null {
  for (let i = rows.length - 1; i >= 0; i--) {
    const v = rows[i][key];

    if (typeof v === "number" && Number.isFinite(v)) {
      return v;
    }
  }

  return null;
}

function getMinPoint(rows: ChartRow[]) {
  let best: { ms: number; value: number } | null = null;

  for (const r of rows) {
    const value =
      r.levelMin !== null && r.levelMin !== undefined ? r.levelMin : r.level;

    if (value === null || !Number.isFinite(value)) continue;

    if (!best || value < best.value) {
      best = { ms: r.ms, value };
    }
  }

  return best;
}

function getMaxPoint(rows: ChartRow[]) {
  let best: { ms: number; value: number } | null = null;

  for (const r of rows) {
    const value =
      r.levelMax !== null && r.levelMax !== undefined ? r.levelMax : r.level;

    if (value === null || !Number.isFinite(value)) continue;

    if (!best || value > best.value) {
      best = { ms: r.ms, value };
    }
  }

  return best;
}

function buildRows(ts?: TankTs): ChartRow[] {
  const timestamps = ts?.timestamps ?? [];
  const levelValues = ts?.level_percent ?? [];
  const minValues = ts?.level_min ?? [];
  const maxValues = ts?.level_max ?? [];

  const n = Math.min(
    timestamps.length,
    Math.max(levelValues.length, minValues.length, maxValues.length)
  );

  const rows: ChartRow[] = [];

  for (let i = 0; i < n; i++) {
    const ms = toMs(timestamps[i]);

    if (!Number.isFinite(ms)) continue;

    const level = clampLevel(toNum(levelValues[i]));
    const levelMinRaw = clampLevel(toNum(minValues[i]));
    const levelMaxRaw = clampLevel(toNum(maxValues[i]));

    const levelMin =
      levelMinRaw !== null
        ? levelMinRaw
        : level !== null
          ? level
          : null;

    const levelMax =
      levelMaxRaw !== null
        ? levelMaxRaw
        : level !== null
          ? level
          : null;

    const bandBase = levelMin;
    const bandRange =
      levelMin !== null && levelMax !== null
        ? Math.max(0, levelMax - levelMin)
        : null;

    rows.push({
      ms,
      level,
      levelMin,
      levelMax,
      bandBase,
      bandRange,
    });
  }

  return rows.sort((a, b) => a.ms - b.ms);
}

function CustomTooltip({
  active,
  label,
  payload,
  tz,
}: {
  active?: boolean;
  label?: any;
  payload?: any[];
  tz: string;
}) {
  if (!active || !payload?.length) return null;

  const row = payload?.[0]?.payload as ChartRow | undefined;

  if (!row) return null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white/95 p-3 text-xs shadow-lg">
      <div className="mb-2 font-semibold text-slate-700">
        {fmtDateTime(Number(label ?? row.ms), tz)}
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between gap-6">
          <span className="text-slate-500">Nivel promedio</span>
          <span className="font-semibold text-slate-800">
            {fmtLevel(row.level)}
          </span>
        </div>

        <div className="flex items-center justify-between gap-6">
          <span className="text-slate-500">Mínimo real</span>
          <span className="font-semibold text-slate-800">
            {fmtLevel(row.levelMin)}
          </span>
        </div>

        <div className="flex items-center justify-between gap-6">
          <span className="text-slate-500">Máximo real</span>
          <span className="font-semibold text-slate-800">
            {fmtLevel(row.levelMax)}
          </span>
        </div>

        {row.levelCmp !== undefined && (
          <div className="flex items-center justify-between gap-6 border-t pt-1">
            <span className="text-slate-500">Auditoría</span>
            <span className="font-semibold text-slate-800">
              {fmtLevel(row.levelCmp)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
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
  showBrushIf = 0,

  lowPct,
  lowLowPct,
  highPct,
  highHighPct,
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

  /**
   * Si la cantidad de puntos supera este número, muestra Brush.
   * Mantiene compatibilidad con el widget actual.
   */
  showBrushIf?: number;

  /**
   * Umbrales opcionales.
   * Si más adelante los pasás desde el backend, se dibujan como líneas.
   */
  lowPct?: number | null;
  lowLowPct?: number | null;
  highPct?: number | null;
  highHighPct?: number | null;
}) {
  const data = useMemo(() => buildRows(ts), [ts]);

  const dataCmp = useMemo(() => {
    if (!compareTs) return null;

    const t = compareTs.timestamps ?? [];
    const v = compareTs.level_percent ?? [];
    const n = Math.min(t.length, v.length);

    const rows: { ms: number; levelCmp: number | null }[] = [];

    for (let i = 0; i < n; i++) {
      const ms = toMs(t[i]);

      if (!Number.isFinite(ms)) continue;

      rows.push({
        ms,
        levelCmp: clampLevel(toNum(v[i])),
      });
    }

    return rows;
  }, [compareTs]);

  const merged = useMemo(() => {
    if (!dataCmp) return data;

    const map = new Map<number, ChartRow>();

    for (const r of data) {
      map.set(r.ms, { ...r });
    }

    for (const r of dataCmp) {
      const cur = map.get(r.ms);

      if (cur) {
        cur.levelCmp = r.levelCmp;
      } else {
        map.set(r.ms, {
          ms: r.ms,
          level: null,
          levelMin: null,
          levelMax: null,
          bandBase: null,
          bandRange: null,
          levelCmp: r.levelCmp,
        });
      }
    }

    return Array.from(map.values()).sort((a, b) => a.ms - b.ms);
  }, [data, dataCmp]);

  const summary = useMemo(() => {
    const current = lastValid(merged, "level");
    const minPoint = getMinPoint(merged);
    const maxPoint = getMaxPoint(merged);

    return {
      current,
      minPoint,
      maxPoint,
      points: merged.length,
    };
  }, [merged]);

  const hasData = merged.length > 0;

  const shouldShowBrush =
    showBrushIf > 0 && merged.length > showBrushIf && !xDomain;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-700">{title}</div>
          <div className="mt-1 text-xs text-slate-400">
            Banda mín/máx real + promedio operativo
          </div>
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          <div className="rounded-full bg-slate-100 px-2 py-1 text-slate-600">
            Actual:{" "}
            <span className="font-semibold text-slate-800">
              {fmtLevel(summary.current)}
            </span>
          </div>

          <div className="rounded-full bg-red-50 px-2 py-1 text-red-700">
            Mín:{" "}
            <span className="font-semibold">
              {fmtLevel(summary.minPoint?.value)}
            </span>
          </div>

          <div className="rounded-full bg-blue-50 px-2 py-1 text-blue-700">
            Máx:{" "}
            <span className="font-semibold">
              {fmtLevel(summary.maxPoint?.value)}
            </span>
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
            <ComposedChart
              data={merged}
              syncId={syncId}
              margin={{ top: 12, right: 24, bottom: shouldShowBrush ? 18 : 4, left: 0 }}
              onMouseMove={(e: any) => {
                if (!onHoverX) return;

                const x = Number(e?.activeLabel);

                onHoverX(Number.isFinite(x) ? x : null);
              }}
              onMouseLeave={() => onHoverX && onHoverX(null)}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />

              <XAxis
                type="number"
                dataKey="ms"
                domain={(xDomain as any) ?? ["dataMin", "dataMax"]}
                ticks={xTicks as any}
                tickFormatter={(ms: any) =>
                  Number.isFinite(Number(ms)) ? fmtTime(Number(ms), tz) : ""
                }
                tick={{ fontSize: 11, fill: "#64748b" }}
                axisLine={{ stroke: "#cbd5e1" }}
                tickLine={{ stroke: "#cbd5e1" }}
              />

              <YAxis
                domain={[0, 100]}
                tickFormatter={(n: any) => `${Number(n).toFixed(0)}%`}
                tick={{ fontSize: 11, fill: "#64748b" }}
                axisLine={{ stroke: "#cbd5e1" }}
                tickLine={{ stroke: "#cbd5e1" }}
                width={42}
              />

              <Tooltip
                content={(props: any) => <CustomTooltip {...props} tz={tz} />}
              />

              <Legend
                wrapperStyle={{ fontSize: 12 }}
                verticalAlign="top"
                height={28}
              />

              {/* Umbrales opcionales */}
              {typeof highHighPct === "number" && (
                <ReferenceLine
                  y={highHighPct}
                  stroke="#dc2626"
                  strokeDasharray="4 4"
                  label={{
                    value: "Alto crítico",
                    position: "insideTopRight",
                    fill: "#dc2626",
                    fontSize: 11,
                  }}
                />
              )}

              {typeof highPct === "number" && (
                <ReferenceLine
                  y={highPct}
                  stroke="#f59e0b"
                  strokeDasharray="4 4"
                  label={{
                    value: "Alto",
                    position: "insideTopRight",
                    fill: "#b45309",
                    fontSize: 11,
                  }}
                />
              )}

              {typeof lowPct === "number" && (
                <ReferenceLine
                  y={lowPct}
                  stroke="#f59e0b"
                  strokeDasharray="4 4"
                  label={{
                    value: "Bajo",
                    position: "insideBottomRight",
                    fill: "#b45309",
                    fontSize: 11,
                  }}
                />
              )}

              {typeof lowLowPct === "number" && (
                <ReferenceLine
                  y={lowLowPct}
                  stroke="#dc2626"
                  strokeDasharray="4 4"
                  label={{
                    value: "Bajo crítico",
                    position: "insideBottomRight",
                    fill: "#dc2626",
                    fontSize: 11,
                  }}
                />
              )}

              {/* Banda min/max: base invisible + rango visible */}
              <Area
                type="monotone"
                dataKey="bandBase"
                stackId="range"
                stroke="transparent"
                fill="transparent"
                isAnimationActive={false}
                connectNulls
                legendType="none"
              />

              <Area
                type="monotone"
                dataKey="bandRange"
                stackId="range"
                name="Rango mín/máx"
                stroke="transparent"
                fill="#bfdbfe"
                fillOpacity={0.45}
                isAnimationActive={false}
                connectNulls
              />

              <Line
                type="monotone"
                dataKey="level"
                name="Nivel promedio"
                stroke="#2563eb"
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 4 }}
                isAnimationActive={false}
                connectNulls
              />

              {dataCmp && (
                <Line
                  type="monotone"
                  dataKey="levelCmp"
                  name={`${compareLabel}`}
                  stroke="#64748b"
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  dot={false}
                  activeDot={{ r: 4 }}
                  isAnimationActive={false}
                  connectNulls
                />
              )}

              {summary.minPoint && (
                <ReferenceDot
                  x={summary.minPoint.ms}
                  y={summary.minPoint.value}
                  r={4}
                  fill="#dc2626"
                  stroke="#ffffff"
                  strokeWidth={2}
                  label={{
                    value: `Mín ${fmtLevel(summary.minPoint.value)}`,
                    position: "bottom",
                    fill: "#dc2626",
                    fontSize: 11,
                  }}
                />
              )}

              {summary.maxPoint && (
                <ReferenceDot
                  x={summary.maxPoint.ms}
                  y={summary.maxPoint.value}
                  r={4}
                  fill="#2563eb"
                  stroke="#ffffff"
                  strokeWidth={2}
                  label={{
                    value: `Máx ${fmtLevel(summary.maxPoint.value)}`,
                    position: "top",
                    fill: "#2563eb",
                    fontSize: 11,
                  }}
                />
              )}

              {hoverX ? (
                <ReferenceLine
                  x={hoverX}
                  stroke="#0f172a"
                  strokeWidth={1}
                  strokeOpacity={0.45}
                />
              ) : null}

              {shouldShowBrush && (
                <Brush
                  dataKey="ms"
                  height={18}
                  travellerWidth={8}
                  tickFormatter={(ms: any) =>
                    Number.isFinite(Number(ms)) ? fmtTime(Number(ms), tz) : ""
                  }
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>

      {summary.minPoint || summary.maxPoint ? (
        <div className="mt-3 grid grid-cols-1 gap-2 text-xs text-slate-500 sm:grid-cols-2">
          {summary.minPoint && (
            <div className="rounded-xl bg-red-50 px-3 py-2 text-red-700">
              Mínimo real:{" "}
              <span className="font-semibold">
                {fmtLevel(summary.minPoint.value)}
              </span>{" "}
              a las{" "}
              <span className="font-semibold">
                {fmtTime(summary.minPoint.ms, tz)}
              </span>
            </div>
          )}

          {summary.maxPoint && (
            <div className="rounded-xl bg-blue-50 px-3 py-2 text-blue-700">
              Máximo real:{" "}
              <span className="font-semibold">
                {fmtLevel(summary.maxPoint.value)}
              </span>{" "}
              a las{" "}
              <span className="font-semibold">
                {fmtTime(summary.maxPoint.ms, tz)}
              </span>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}