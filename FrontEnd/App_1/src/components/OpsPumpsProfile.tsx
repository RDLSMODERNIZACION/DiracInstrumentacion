import React, { useMemo, useState } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  ReferenceLine,
  ReferenceDot,
  Brush,
} from "recharts";

type MaybeNum = number | string | null | undefined;

export type PumpsTs = {
  timestamps?: MaybeNum[];
  is_on?: Array<number | boolean | string | null>;
  pumps_off?: MaybeNum[];
  pumps_online?: MaybeNum[];
  pumps_offline?: MaybeNum[];
} | null;

export type PumpTimelineItem = {
  minute_ts?: string | null;
  ts?: string | null;
  ts_ms?: number | string | null;
  local_minute_ts?: string | null;

  pump_id?: number | string | null;
  pump_name?: string | null;
  location_name?: string | null;

  is_on?: boolean | number | string | null;
  state?: string | null;
  state_label?: string | null;

  online?: boolean | number | string | null;
  data_quality?: string | null;
};

type ChartRow = {
  ms: number;
  on: number | null;
  off: number | null;
  online: number | null;
  offline: number | null;
  onPct: number | null;
  onlinePct: number | null;
  onCmp?: number | null;

  activePumpNames: string[];
  stoppedPumpNames: string[];
  offlinePumpNames: string[];
};

function toMs(x: MaybeNum): number {
  if (typeof x === "number") {
    if (!Number.isFinite(x)) return NaN;
    return x > 2_000_000_000 ? x : x * 1000;
  }

  if (typeof x === "string") {
    const n = Number(x);

    if (Number.isFinite(n)) {
      return n > 2_000_000_000 ? n : n * 1000;
    }

    const t = Date.parse(x);
    if (Number.isFinite(t)) return t;
  }

  return NaN;
}

function floorMinute(ms: number) {
  const d = new Date(ms);
  d.setSeconds(0, 0);
  return d.getTime();
}

function toNum(x: any): number | null {
  if (x === null || x === undefined || x === "") return null;
  if (x === true) return 1;
  if (x === false) return 0;

  const n = typeof x === "string" ? Number(x.replace(",", ".")) : Number(x);
  return Number.isFinite(n) ? n : null;
}

function toBool(x: any): boolean | null {
  if (x === null || x === undefined || x === "") return null;
  if (typeof x === "boolean") return x;
  if (typeof x === "number") return x !== 0;

  const s = String(x).trim().toLowerCase();

  if (["true", "1", "on", "run", "running", "encendida"].includes(s)) {
    return true;
  }

  if (["false", "0", "off", "stop", "stopped", "apagada"].includes(s)) {
    return false;
  }

  return null;
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
    return new Date(ms).toLocaleTimeString("es-AR");
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
    return new Date(ms).toLocaleString("es-AR");
  }
}

function fmtInt(v: any) {
  const n = toNum(v);
  if (n === null) return "--";
  return Math.round(n).toLocaleString("es-AR");
}

function fmtNum(v: any, decimals = 1) {
  const n = toNum(v);
  if (n === null) return "--";

  return n.toLocaleString("es-AR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function fmtPct(v: any, decimals = 1) {
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

function averageValid(rows: ChartRow[], key: keyof ChartRow): number | null {
  const xs: number[] = [];

  for (const r of rows) {
    const v = r[key];

    if (typeof v === "number" && Number.isFinite(v)) {
      xs.push(v);
    }
  }

  if (!xs.length) return null;

  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function getMaxPoint(rows: ChartRow[]) {
  let best: { ms: number; value: number } | null = null;

  for (const r of rows) {
    const value = r.on;

    if (value === null || !Number.isFinite(value)) continue;

    if (!best || value > best.value) {
      best = {
        ms: r.ms,
        value,
      };
    }
  }

  return best;
}

function normalizeState(state?: string | null) {
  return String(state ?? "")
    .trim()
    .toLowerCase();
}

function getItemMs(item: PumpTimelineItem): number {
  const raw =
    item.ts_ms ??
    item.minute_ts ??
    item.local_minute_ts ??
    item.ts ??
    null;

  const ms = toMs(raw);
  return Number.isFinite(ms) ? floorMinute(ms) : NaN;
}

function getPumpName(item: PumpTimelineItem) {
  const name = item.pump_name?.trim();

  if (name) return name;

  if (item.pump_id !== null && item.pump_id !== undefined && item.pump_id !== "") {
    return `Bomba ${item.pump_id}`;
  }

  return "Bomba sin nombre";
}

function buildTimelineMap(timelineItems?: PumpTimelineItem[]) {
  const map = new Map<
    number,
    {
      active: string[];
      stopped: string[];
      offline: string[];
    }
  >();

  for (const item of timelineItems ?? []) {
    const ms = getItemMs(item);
    if (!Number.isFinite(ms)) continue;

    const name = getPumpName(item);

    if (!map.has(ms)) {
      map.set(ms, {
        active: [],
        stopped: [],
        offline: [],
      });
    }

    const bucket = map.get(ms)!;

    const online = toBool(item.online);
    const isOn = toBool(item.is_on);
    const state = normalizeState(item.state);
    const label = normalizeState(item.state_label);

    const looksOn =
      isOn === true ||
      state === "run" ||
      state === "running" ||
      state === "on" ||
      label.includes("encendida") ||
      label.includes("prendida");

    const looksOff =
      isOn === false ||
      state === "stop" ||
      state === "stopped" ||
      state === "off" ||
      label.includes("apagada");

    if (online === false) {
      bucket.offline.push(name);
    } else if (looksOn) {
      bucket.active.push(name);
    } else if (looksOff) {
      bucket.stopped.push(name);
    } else {
      bucket.stopped.push(name);
    }
  }

  for (const v of map.values()) {
    v.active = Array.from(new Set(v.active)).sort();
    v.stopped = Array.from(new Set(v.stopped)).sort();
    v.offline = Array.from(new Set(v.offline)).sort();
  }

  return map;
}

function buildRows(
  pumpsTs?: PumpsTs,
  max?: number,
  timelineItems?: PumpTimelineItem[]
): ChartRow[] {
  const timestamps = pumpsTs?.timestamps ?? [];
  const onValues = pumpsTs?.is_on ?? [];
  const offValues = pumpsTs?.pumps_off ?? [];
  const onlineValues = pumpsTs?.pumps_online ?? [];
  const offlineValues = pumpsTs?.pumps_offline ?? [];

  const timelineMap = buildTimelineMap(timelineItems);

  const n = Math.min(
    timestamps.length,
    Math.max(
      onValues.length,
      offValues.length,
      onlineValues.length,
      offlineValues.length,
      0
    )
  );

  const rows: ChartRow[] = [];

  for (let i = 0; i < n; i++) {
    const msRaw = toMs(timestamps[i]);
    if (!Number.isFinite(msRaw)) continue;

    const ms = floorMinute(msRaw);

    const onRaw = toNum(onValues[i]);
    const offRaw = toNum(offValues[i]);
    const onlineRaw = toNum(onlineValues[i]);
    const offlineRaw = toNum(offlineValues[i]);

    let on = onRaw === null ? null : Math.max(0, onRaw);

    if (typeof max === "number" && Number.isFinite(max) && on !== null) {
      on = Math.min(on, max);
    }

    let off = offRaw === null ? null : Math.max(0, offRaw);

    if (
      off === null &&
      typeof max === "number" &&
      Number.isFinite(max) &&
      on !== null
    ) {
      off = Math.max(0, max - on);
    }

    const online =
      onlineRaw !== null
        ? Math.max(0, onlineRaw)
        : typeof max === "number" && Number.isFinite(max)
          ? max
          : on !== null && off !== null
            ? on + off
            : null;

    const offline =
      offlineRaw !== null
        ? Math.max(0, offlineRaw)
        : typeof max === "number" && Number.isFinite(max) && online !== null
          ? Math.max(0, max - online)
          : null;

    const total =
      typeof max === "number" && Number.isFinite(max)
        ? max
        : on !== null && off !== null
          ? on + off
          : online !== null && offline !== null
            ? online + offline
            : null;

    const onPct = total && total > 0 && on !== null ? (on / total) * 100 : null;

    const onlinePct =
      total && total > 0 && online !== null ? (online / total) * 100 : null;

    const detail = timelineMap.get(ms);

    rows.push({
      ms,
      on,
      off,
      online,
      offline,
      onPct,
      onlinePct,
      activePumpNames: detail?.active ?? [],
      stoppedPumpNames: detail?.stopped ?? [],
      offlinePumpNames: detail?.offline ?? [],
    });
  }

  return rows.sort((a, b) => a.ms - b.ms);
}

function PumpNamesBlock({
  title,
  names,
  empty,
  colorClass,
}: {
  title: string;
  names?: string[];
  empty: string;
  colorClass: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
      <div className={`mb-1 text-[11px] font-semibold ${colorClass}`}>
        {title} · {names?.length ?? 0}
      </div>

      {names && names.length > 0 ? (
        <div className="flex max-h-32 flex-wrap gap-1 overflow-auto">
          {names.map((name) => (
            <span
              key={name}
              className="rounded-full bg-white px-2 py-0.5 text-[11px] text-slate-700 shadow-sm"
            >
              {name}
            </span>
          ))}
        </div>
      ) : (
        <div className="text-[11px] text-slate-400">{empty}</div>
      )}
    </div>
  );
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
    <div className="w-[340px] rounded-xl border border-slate-200 bg-white/95 p-3 text-xs shadow-lg">
      <div className="mb-2 font-semibold text-slate-700">
        {fmtDateTime(Number(label ?? row.ms), tz)}
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-emerald-50 px-2 py-1">
          <div className="text-[11px] text-emerald-700">Bombas ON</div>
          <div className="text-lg font-bold text-emerald-800">
            {fmtInt(row.on)}
          </div>
        </div>

        <div className="rounded-lg bg-slate-100 px-2 py-1">
          <div className="text-[11px] text-slate-500">Bombas OFF</div>
          <div className="text-lg font-bold text-slate-800">
            {fmtInt(row.off)}
          </div>
        </div>

        <div className="rounded-lg bg-blue-50 px-2 py-1">
          <div className="text-[11px] text-blue-700">Online</div>
          <div className="text-lg font-bold text-blue-800">
            {fmtInt(row.online)}
          </div>
        </div>

        <div className="rounded-lg bg-red-50 px-2 py-1">
          <div className="text-[11px] text-red-700">Sin comunicación</div>
          <div className="text-lg font-bold text-red-800">
            {fmtInt(row.offline)}
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <PumpNamesBlock
          title="Encendidas en este minuto"
          names={row.activePumpNames}
          empty="No hay detalle de bombas encendidas para este minuto."
          colorClass="text-emerald-700"
        />

        <PumpNamesBlock
          title="Apagadas"
          names={row.stoppedPumpNames}
          empty="Sin detalle de bombas apagadas."
          colorClass="text-slate-600"
        />

        {row.offlinePumpNames && row.offlinePumpNames.length > 0 && (
          <PumpNamesBlock
            title="Sin comunicación"
            names={row.offlinePumpNames}
            empty="Sin bombas offline."
            colorClass="text-red-700"
          />
        )}
      </div>

      <div className="mt-2 border-t pt-2 text-[11px] text-slate-500">
        Uso: <span className="font-semibold">{fmtPct(row.onPct)}</span> ·
        Comunicación:{" "}
        <span className="font-semibold">{fmtPct(row.onlinePct)}</span>
      </div>
    </div>
  );
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
  showBrushIf = 0,
  timelineItems = [],
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
  showBrushIf?: number;
  timelineItems?: PumpTimelineItem[];
}) {
  const [selectedRow, setSelectedRow] = useState<ChartRow | null>(null);

  const data = useMemo(
    () => buildRows(pumpsTs, max, timelineItems),
    [pumpsTs, max, timelineItems]
  );

  const dataCmp = useMemo(() => {
    if (!comparePumpsTs) return null;

    const timestamps = comparePumpsTs.timestamps ?? [];
    const values = comparePumpsTs.is_on ?? [];
    const n = Math.min(timestamps.length, values.length);

    const rows: { ms: number; onCmp: number | null }[] = [];

    for (let i = 0; i < n; i++) {
      const ms = floorMinute(toMs(timestamps[i]));
      if (!Number.isFinite(ms)) continue;

      rows.push({
        ms,
        onCmp: toNum(values[i]),
      });
    }

    return rows;
  }, [comparePumpsTs]);

  const merged = useMemo(() => {
    if (!dataCmp) return data;

    const map = new Map<number, ChartRow>();

    for (const r of data) {
      map.set(r.ms, { ...r });
    }

    for (const r of dataCmp) {
      const cur = map.get(r.ms);

      if (cur) {
        cur.onCmp = r.onCmp;
      } else {
        map.set(r.ms, {
          ms: r.ms,
          on: null,
          off: null,
          online: null,
          offline: null,
          onPct: null,
          onlinePct: null,
          onCmp: r.onCmp,
          activePumpNames: [],
          stoppedPumpNames: [],
          offlinePumpNames: [],
        });
      }
    }

    return Array.from(map.values()).sort((a, b) => a.ms - b.ms);
  }, [data, dataCmp]);

  const summary = useMemo(() => {
    const currentOn = lastValid(merged, "on");
    const currentOff = lastValid(merged, "off");
    const currentOffline = lastValid(merged, "offline");
    const avgOn = averageValid(merged, "on");
    const avgOnPct = averageValid(merged, "onPct");
    const maxPoint = getMaxPoint(merged);

    return {
      currentOn,
      currentOff,
      currentOffline,
      avgOn,
      avgOnPct,
      maxPoint,
      points: merged.length,
    };
  }, [merged]);

  const hasData = merged.length > 0;

  const hasOffline = useMemo(
    () => merged.some((r) => (r.offline ?? 0) > 0),
    [merged]
  );

  const yMax = useMemo(() => {
    const maxOn = Math.max(...merged.map((d) => Number(d.on ?? 0)), 0);
    const maxOffline = hasOffline
      ? Math.max(...merged.map((d) => Number(d.offline ?? 0)), 0)
      : 0;
    const maxCmp = Math.max(...merged.map((d) => Number(d.onCmp ?? 0)), 0);

    return Math.max(max ?? 0, maxOn, maxOffline, maxCmp, 1);
  }, [merged, max, hasOffline]);

  const shouldShowBrush =
    showBrushIf > 0 && merged.length > showBrushIf && !xDomain;

  const hasTimelineDetail = timelineItems.length > 0;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-700">{title}</div>

          <div className="mt-1 text-xs text-slate-400">
            Tocá o pasá por un punto del gráfico para ver qué bombas estaban
            encendidas en ese minuto.
          </div>
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          <div className="rounded-full bg-emerald-50 px-2 py-1 text-emerald-700">
            ON actual:{" "}
            <span className="font-semibold">{fmtInt(summary.currentOn)}</span>
          </div>

          <div className="rounded-full bg-slate-100 px-2 py-1 text-slate-600">
            OFF:{" "}
            <span className="font-semibold">{fmtInt(summary.currentOff)}</span>
          </div>

          {hasOffline && (
            <div className="rounded-full bg-red-50 px-2 py-1 text-red-700">
              Offline:{" "}
              <span className="font-semibold">
                {fmtInt(summary.currentOffline)}
              </span>
            </div>
          )}

          <div className="rounded-full bg-blue-50 px-2 py-1 text-blue-700">
            Máx ON:{" "}
            <span className="font-semibold">
              {fmtInt(summary.maxPoint?.value)}
            </span>
          </div>
        </div>
      </div>

      {!hasTimelineDetail && (
        <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          El gráfico tiene el conteo de bombas, pero todavía no llegó el detalle
          por bomba. Revisá que `loadPumpTimeline: true` esté activado en
          `useLiveOps` y que el backend responda el endpoint de timeline.
        </div>
      )}

      <div className="h-72">
        {!hasData ? (
          <div className="flex h-full items-center justify-center rounded-xl bg-slate-50 text-sm text-slate-400">
            Sin datos de bombas para el filtro actual.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={merged}
              syncId={syncId}
              margin={{
                top: 12,
                right: 24,
                bottom: shouldShowBrush ? 18 : 4,
                left: 0,
              }}
              onMouseMove={(e: any) => {
                const row = e?.activePayload?.[0]?.payload as
                  | ChartRow
                  | undefined;

                if (row) {
                  setSelectedRow(row);
                }

                if (!onHoverX) return;

                const x = Number(e?.activeLabel);
                onHoverX(Number.isFinite(x) ? x : null);
              }}
              onClick={(e: any) => {
                const row = e?.activePayload?.[0]?.payload as
                  | ChartRow
                  | undefined;

                if (row) {
                  setSelectedRow(row);
                }
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
                domain={[0, yMax]}
                allowDecimals={false}
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

              <Area
                type="stepAfter"
                dataKey="on"
                name="Bombas ON"
                stroke="#059669"
                fill="#bbf7d0"
                fillOpacity={0.5}
                strokeWidth={2.75}
                isAnimationActive={false}
                connectNulls
              />

              {hasOffline && (
                <Area
                  type="stepAfter"
                  dataKey="offline"
                  name="Sin comunicación"
                  stroke="#dc2626"
                  fill="#fecaca"
                  fillOpacity={0.35}
                  strokeWidth={2}
                  isAnimationActive={false}
                  connectNulls
                />
              )}

              {dataCmp && (
                <Line
                  type="stepAfter"
                  dataKey="onCmp"
                  name={`${compareLabel} ON`}
                  stroke="#0f172a"
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  dot={false}
                  activeDot={{ r: 4 }}
                  isAnimationActive={false}
                  connectNulls
                />
              )}

              {summary.maxPoint && (
                <ReferenceDot
                  x={summary.maxPoint.ms}
                  y={summary.maxPoint.value}
                  r={4}
                  fill="#059669"
                  stroke="#ffffff"
                  strokeWidth={2}
                  label={{
                    value: `Máx ${fmtInt(summary.maxPoint.value)}`,
                    position: "top",
                    fill: "#059669",
                    fontSize: 11,
                  }}
                />
              )}

              {typeof max === "number" && Number.isFinite(max) && max > 0 && (
                <ReferenceLine
                  y={max}
                  stroke="#94a3b8"
                  strokeDasharray="4 4"
                  label={{
                    value: `Total ${max}`,
                    position: "insideTopRight",
                    fill: "#64748b",
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

      {selectedRow && (
        <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-sm font-semibold text-slate-700">
                Estado de bombas en el minuto seleccionado
              </div>

              <div className="text-xs text-slate-500">
                {fmtDateTime(selectedRow.ms, tz)}
              </div>
            </div>

            <div className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
              {fmtInt(selectedRow.on)} encendidas
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2 lg:grid-cols-3">
            <PumpNamesBlock
              title="Encendidas"
              names={selectedRow.activePumpNames}
              empty="No había bombas encendidas o no llegó detalle."
              colorClass="text-emerald-700"
            />

            <PumpNamesBlock
              title="Apagadas"
              names={selectedRow.stoppedPumpNames}
              empty="Sin detalle de bombas apagadas."
              colorClass="text-slate-600"
            />

            <PumpNamesBlock
              title="Sin comunicación"
              names={selectedRow.offlinePumpNames}
              empty="Sin bombas offline."
              colorClass="text-red-700"
            />
          </div>
        </div>
      )}

      {summary.maxPoint ? (
        <div className="mt-3 grid grid-cols-1 gap-2 text-xs sm:grid-cols-3">
          <div className="rounded-xl bg-emerald-50 px-3 py-2 text-emerald-700">
            Máximo ON:{" "}
            <span className="font-semibold">
              {fmtInt(summary.maxPoint.value)}
            </span>{" "}
            a las{" "}
            <span className="font-semibold">
              {fmtTime(summary.maxPoint.ms, tz)}
            </span>
          </div>

          <div className="rounded-xl bg-slate-50 px-3 py-2 text-slate-600">
            Promedio ON:{" "}
            <span className="font-semibold">{fmtNum(summary.avgOn)}</span>{" "}
            bombas
          </div>

          <div className="rounded-xl bg-blue-50 px-3 py-2 text-blue-700">
            Uso promedio:{" "}
            <span className="font-semibold">{fmtPct(summary.avgOnPct)}</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}