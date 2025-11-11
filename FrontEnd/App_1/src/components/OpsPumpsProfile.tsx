import React, { useMemo } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  ReferenceArea,
  ReferenceLine,
} from "recharts";

type Agg = { timestamps?: Array<number | string>; is_on?: Array<number | boolean | string | null> };

type Props = {
  pumpsTs: Agg | null | undefined;
  title?: string;
  tz?: string;
  height?: number;
  max?: number;
  syncId?: string;
  /** sync con tanques (misma ventana y ticks) */
  xDomain?: [number, number];
  xTicks?: number[];
  /** crosshair sincronizado */
  hoverX?: number | null;
  onHoverX?: (x: number | null) => void;
};

const toMs = (x: number | string) => {
  if (typeof x === "number") return x > 10_000 ? x : x * 1000;
  const n = Number(x);
  if (Number.isFinite(n) && n > 10_000) return n;
  return new Date(x).getTime();
};
const startOfMin = (ms: number) => { const d = new Date(ms); d.setSeconds(0,0); return d.getTime(); };
const addMinutes = (ms: number, m: number) => ms + m * 60_000;

const fmtHM = (ms: number, tz = "America/Argentina/Buenos_Aires") => {
  try {
    return new Intl.DateTimeFormat("es-AR", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(ms);
  } catch {
    const d = new Date(ms);
    return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
  }
};

/** Serie por minuto con carry-forward del estado. Ventana opcional [start,end]. */
function buildContinuousProfile(pumps: Agg, forceWindow?: { start: number; end: number }) {
  const ts = pumps?.timestamps ?? [];
  const vs = pumps?.is_on ?? [];

  const pairs: Array<{ ms: number; on: number }> = [];
  const N = Math.min(ts.length, vs.length);
  for (let i = 0; i < N; i++) {
    const ms = toMs(ts[i] as any);
    if (!Number.isFinite(ms)) continue;
    let on: any = vs[i];
    on = typeof on === "boolean" ? (on ? 1 : 0) : (on == null ? 0 : Number(on));
    pairs.push({ ms, on: Number(on) || 0 });
  }
  pairs.sort((a, b) => a.ms - b.ms);

  const nowLike = pairs.length ? pairs[pairs.length - 1].ms : Date.now();
  const end   = forceWindow?.end ?? startOfMin(nowLike);
  const start = forceWindow?.start ?? (end - 24 * 60 * 60 * 1000);

  // baseline = último evento antes de start
  let baseline = 0, i = 0;
  while (i < pairs.length && pairs[i].ms <= start) { baseline = pairs[i].on; i++; }

  // recorro minuto a minuto, manteniendo estado
  const series: Array<{ x: number; on: number; tLabel: string }> = [];
  let last = baseline, j = i;
  for (let t = start; t <= end; t = addMinutes(t, 1)) {
    while (j < pairs.length && pairs[j].ms <= t) { last = pairs[j].on; j++; }
    series.push({ x: t, on: last, tLabel: fmtHM(t) });
  }

  // spans ON para sombrear
  const spans: Array<{ x1: number; x2: number }> = [];
  let curStart: number | null = null;
  for (let k = 0; k < series.length; k++) {
    const d = series[k];
    if (d.on > 0) { if (curStart === null) curStart = d.x; }
    else if (curStart !== null) { spans.push({ x1: curStart, x2: addMinutes(series[k-1].x, 1) }); curStart = null; }
  }
  if (curStart !== null) spans.push({ x1: curStart, x2: addMinutes(series.at(-1)!.x, 1) });

  const yDataMax = Math.max(0, ...series.map(d => d.on));
  return { series, yDataMax, spans };
}

export default function OpsPumpsProfile({
  pumpsTs,
  title = "Perfil horario (24h)",
  tz = "America/Argentina/Buenos_Aires",
  height = 260,
  max,
  syncId,
  xDomain,
  xTicks,
  hoverX,
  onHoverX,
}: Props) {
  const { series, yDataMax, spans } = useMemo(
    () => buildContinuousProfile(pumpsTs ?? {}, xDomain ? { start: xDomain[0], end: xDomain[1] } : undefined),
    [pumpsTs, xDomain]
  );

  const yMax = Math.max(1, yDataMax, max ?? 0);

  // estética alineada con TankLevelChart
  const GRID_COLOR = "rgba(0,0,0,.18)";
  const AXIS_COLOR = "rgba(0,0,0,.20)";
  const TICK_COLOR = "#475569";
  const gradId = useMemo(() => `gradOpsPumps_${Math.random().toString(36).slice(2)}`, []);

  return (
    <Card className="rounded-2xl">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm text-gray-500">{title}</CardTitle>
      </CardHeader>

      <CardContent style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={series}
            syncId={syncId}
            syncMethod="value"
            margin={{ top: 8, right: 16, left: 8, bottom: 0 }}
            onMouseMove={(st: any) => {
              if (st && typeof st.activeLabel === "number") onHoverX?.(st.activeLabel);
            }}
            onMouseLeave={() => onHoverX?.(null)}
          >
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#0b0f19" stopOpacity={0.25} />
                <stop offset="100%" stopColor="#0b0f19" stopOpacity={0.08} />
              </linearGradient>
            </defs>

            <CartesianGrid stroke={GRID_COLOR} strokeDasharray="3 3" />

            <XAxis
              dataKey="x"
              type="number"
              scale="time"
              domain={xDomain ?? ["dataMin", "dataMax"]}
              ticks={xTicks}
              tickFormatter={(v) => fmtHM(v as number, tz)}
              axisLine={{ stroke: AXIS_COLOR }}
              tickLine={false}
              tick={{ fontSize: 11, fill: TICK_COLOR }}
              minTickGap={24}
              height={28}
              tickMargin={8}
              allowDataOverflow
            />
            <YAxis
              domain={[0, yMax]}
              allowDecimals={false}
              width={40}
              axisLine={{ stroke: AXIS_COLOR }}
              tickLine={false}
              tick={{ fontSize: 11, fill: TICK_COLOR }}
            />

            {/* Tooltip sin cursor (usamos ReferenceLine compartida) */}
            <Tooltip
              cursor={false}
              content={({ active, payload }) => {
                if (!active || !payload || !payload.length) return null;
                const p = payload[0].payload as { x: number; on: number };
                return (
                  <div className="rounded-md border bg-white/95 px-2 py-1 text-xs shadow">
                    <div>{fmtHM(p.x, tz)}</div>
                    <div><strong>{p.on}</strong> Bombas ON</div>
                  </div>
                );
              }}
            />

            <Legend verticalAlign="top" height={24} />

            {/* sombreado continuo de cada tramo activo */}
            {spans.map((s, i) => (
              <ReferenceArea
                key={i}
                x1={s.x1}
                x2={s.x2}
                y1={0}
                y2={yMax}
                fill="#0b0f19"
                fillOpacity={0.06}
                strokeOpacity={0}
              />
            ))}

            {/* Línea vertical compartida (crosshair) */}
            {typeof hoverX === "number" && (
              <ReferenceLine x={hoverX} stroke="#0b0f19" strokeDasharray="4 4" opacity={0.6} />
            )}

            {/* Área escalonada con línea superior */}
            <Area
              type="stepAfter"
              dataKey="on"
              name="Bombas ON"
              fill={`url(#${gradId})`}
              stroke="#0b0f19"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
              activeDot={{ r: 2 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
