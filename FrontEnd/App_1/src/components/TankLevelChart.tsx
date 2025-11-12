import React, { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ReferenceArea,
  Legend,
} from "recharts";

type TankTs = {
  timestamps?: Array<number | string>;
  level_percent?: Array<number | string | null>;
};

type Thresholds = {
  low_pct?: number | null;
  low_low_pct?: number | null;
  high_pct?: number | null;
  high_high_pct?: number | null;
};

type Props = {
  ts: TankTs | null;
  title?: string;
  thresholds?: Thresholds;
  tz?: string;
  height?: number;
  showLegend?: boolean;
  /** compat anterior (no se usa) */ showBrushIf?: number;
  syncId?: string;
  xDomain?: [number, number];
  xTicks?: number[];
  hoverX?: number | null;
  onHoverX?: (x: number | null) => void;
};

// "01:30"
const isHourLabel = (s: string) => /^\d{2}:\d{2}$/.test(s);

const toMs = (x: string | number) => {
  if (typeof x === "number") return x;
  const n = Number(x);
  if (Number.isFinite(n) && n > 10_000) return n;
  return new Date(x).getTime();
};

const fmtTime = (ms: number, tz = "America/Argentina/Buenos_Aires") => {
  try {
    return new Intl.DateTimeFormat("es-AR", {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
      day: "2-digit",
      month: "2-digit",
    }).format(ms);
  } catch {
    return new Date(ms).toLocaleString();
  }
};

const fmtHM = (ms: number, tz = "America/Argentina/Buenos_Aires") => {
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
};

export default function TankLevelChart({
  ts,
  title = "Nivel del tanque (24h • en vivo)",
  thresholds,
  tz = "America/Argentina/Buenos_Aires",
  height = 260,
  showLegend = true,
  syncId,
  xDomain,
  xTicks,
  hoverX,
  onHoverX,
}: Props) {
  const rawT = ts?.timestamps ?? [];
  const rawV = ts?.level_percent ?? [];

  // si hay xDomain forzado, vamos en modo tiempo
  const autoMode: "category" | "time" =
    rawT.length && rawT.every((t) => t != null && isHourLabel(String(t)))
      ? "category"
      : "time";
  const mode: "category" | "time" = xDomain ? "time" : autoMode;

  const seriesRaw = useMemo(() => {
    const N = Math.min(rawT.length, rawV.length);
    const out: Array<{ x: number | string; label: string; nivel: number | null }> = [];
    for (let i = 0; i < N; i++) {
      const t = rawT[i];
      const raw = rawV[i];

      const n = raw == null ? NaN : Number(raw);
      const nivel = Number.isFinite(n) ? n : null;

      if (mode === "category") {
        const lbl = String(t ?? "");
        out.push({ x: i, label: lbl, nivel });
      } else {
        const ms = toMs(t as any);
        if (!Number.isFinite(ms)) continue;
        out.push({ x: ms, label: String(t ?? ""), nivel });
      }
    }
    if (mode === "time") out.sort((a, b) => (Number(a.x) as number) - (Number(b.x) as number));
    return out;
  }, [rawT, rawV, mode]);

  const hasData = seriesRaw.some((d) => d.nivel != null);

  // Si NO hay datos, igual renderizamos el chart vacío usando el dominio recibido
  // (o, si no vino, una ventana dummy de 24h relativa a "ahora")
  const fallbackDomain: [number, number] = useMemo(() => {
    if (xDomain) return xDomain;
    const end = Date.now();
    return [end - 24 * 60 * 60 * 1000, end];
  }, [xDomain]);

  const series = useMemo(() => {
    if (hasData) return seriesRaw;
    // dos puntos con nivel=null para que no pinte área pero sí ejes/grilla
    return [
      { x: fallbackDomain[0], label: fmtHM(fallbackDomain[0], tz), nivel: null },
      { x: fallbackDomain[1], label: fmtHM(fallbackDomain[1], tz), nivel: null },
    ];
  }, [hasData, seriesRaw, fallbackDomain, tz]);

  // Y-axis siempre visible (0..100) si no hay datos
  const yMin = useMemo(() => {
    if (!hasData) return 0;
    const vals = seriesRaw.map((d) => (d.nivel == null ? Infinity : d.nivel));
    const m = Math.min(...vals);
    return Number.isFinite(m) ? Math.floor(Math.min(0, m)) : 0;
  }, [hasData, seriesRaw]);

  const yMax = useMemo(() => {
    if (!hasData) return 100;
    const vals = seriesRaw.map((d) => (d.nivel == null ? -Infinity : d.nivel));
    const m = Math.max(...vals);
    return Number.isFinite(m) ? Math.ceil(Math.max(100, m)) : 100;
  }, [hasData, seriesRaw]);

  const L  = thresholds?.low_pct ?? null;
  const LL = thresholds?.low_low_pct ?? null;
  const H  = thresholds?.high_pct ?? null;
  const HH = thresholds?.high_high_pct ?? null;

  const gradId = useMemo(() => `gradTank_${Math.random().toString(36).slice(2)}`, []);

  return (
    <Card className="rounded-2xl">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm text-gray-500">{title}</CardTitle>
      </CardHeader>

      <CardContent style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
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
                <stop offset="0%" stopColor="currentColor" stopOpacity={0.35} />
                <stop offset="100%" stopColor="currentColor" stopOpacity={0.05} />
              </linearGradient>
            </defs>

            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />

            {mode === "time" ? (
              <XAxis
                dataKey="x"
                type="number"
                scale="time"
                domain={xDomain ?? fallbackDomain}
                ticks={xTicks}
                tickFormatter={(v) => fmtHM(v as number, tz)}
                tickMargin={8}
                minTickGap={24}
                allowDataOverflow
              />
            ) : (
              <XAxis dataKey="label" type="category" tickMargin={8} minTickGap={16} />
            )}

            <YAxis domain={[yMin, yMax]} tickFormatter={(v) => `${v}%`} width={40} />

            <Tooltip
              cursor={false}
              content={({ active, payload }) => {
                if (!active || !payload || !payload.length) return null;
                const p = payload[0].payload as { x: number | string; label: string; nivel: number | null };
                const nivel = p.nivel == null ? "--" : `${p.nivel.toFixed(1)}%`;
                const when = mode === "time" ? fmtTime(Number(p.x), tz) : String(p.label);
                return (
                  <div className="rounded-lg border bg-background px-3 py-2 shadow-sm">
                    <div className="text-xs text-muted-foreground">{when}</div>
                    <div className="text-sm font-medium">Nivel: {nivel}</div>
                  </div>
                );
              }}
            />

            {/* Bandas y líneas de umbral */}
            {typeof LL === "number" && <ReferenceArea y1={0} y2={LL} fill="var(--destructive)" fillOpacity={0.08} />}
            {typeof HH === "number" && <ReferenceArea y1={HH} y2={Math.max(100, yMax)} fill="var(--destructive)" fillOpacity={0.08} />}
            {typeof L === "number" && typeof H === "number" && H > L && (
              <ReferenceArea y1={L} y2={H} fill="var(--primary)" fillOpacity={0.06} />
            )}
            {typeof LL === "number" && (
              <ReferenceLine y={LL} stroke="currentColor" strokeDasharray="4 4" opacity={0.6}
                label={{ value: `LL ${LL}%`, position: "insideTopRight", fontSize: 10 }} />
            )}
            {typeof L === "number" && (
              <ReferenceLine y={L} stroke="currentColor" strokeDasharray="4 4" opacity={0.5}
                label={{ value: `L ${L}%`, position: "insideTopRight", fontSize: 10 }} />
            )}
            {typeof H === "number" && (
              <ReferenceLine y={H} stroke="currentColor" strokeDasharray="4 4" opacity={0.5}
                label={{ value: `H ${H}%`, position: "insideTopRight", fontSize: 10 }} />
            )}
            {typeof HH === "number" && (
              <ReferenceLine y={HH} stroke="currentColor" strokeDasharray="4 4" opacity={0.6}
                label={{ value: `HH ${HH}%`, position: "insideTopRight", fontSize: 10 }} />
            )}

            {/* crosshair sincronizado */}
            {typeof hoverX === "number" && (
              <ReferenceLine x={hoverX} stroke="currentColor" strokeDasharray="4 4" opacity={0.6} />
            )}

            <Area
              type="monotone"
              dataKey="nivel"
              name="nivel"
              stroke="currentColor"
              strokeWidth={2}
              fill={`url(#${gradId})`}
              // si no hay datos, NO conectar nulls para que no pinte nada
              connectNulls={hasData}
              dot={false}
              isAnimationActive={false}
              activeDot={{ r: 2 }}
            />

            {showLegend && <Legend verticalAlign="top" height={24} />}
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
