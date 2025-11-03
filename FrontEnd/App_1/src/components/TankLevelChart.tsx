// src/components/TankLevelChart.tsx
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
  Brush,
} from "recharts";

type TankTs = { timestamps?: string[]; level_percent?: Array<number | string | null> };

type Thresholds = {
  low_pct?: number | null;       // L
  low_low_pct?: number | null;   // LL
  high_pct?: number | null;      // H
  high_high_pct?: number | null; // HH
};

type Props = {
  ts: TankTs | null;
  title?: string;
  thresholds?: Thresholds;
  tz?: string;          // default "America/Argentina/Buenos_Aires"
  height?: number;      // default 260
  showLegend?: boolean; // default true
  showBrushIf?: number; // default 120 (si hay muchos puntos aparece el brush)
};

const isHourLabel = (s: string) => /^\d{2}:\d{2}$/.test(s); // "HH:MM"
const toMs = (x: string) => new Date(x).getTime();

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

export default function TankLevelChart({
  ts,
  title = "Nivel del tanque (24h)",
  thresholds,
  tz = "America/Argentina/Buenos_Aires",
  height = 260,
  showLegend = true,
  showBrushIf = 120,
}: Props) {
  const rawT = ts?.timestamps ?? [];
  const rawV = ts?.level_percent ?? [];

  // Detecta si el eje X es categórico ("HH:MM") o temporal (timestamps reales)
  const mode: "category" | "time" =
    rawT.length && rawT.every((t) => t && isHourLabel(String(t))) ? "category" : "time";

  // Serie normalizada
  const series = useMemo(() => {
    const N = Math.min(rawT.length, rawV.length);
    const out: Array<{ x: number | string; label: string; nivel: number | null }> = [];
    for (let i = 0; i < N; i++) {
      const t = String(rawT[i] ?? "");
      const raw = rawV[i];
      const n = raw == null ? NaN : Number(raw);
      const nivel = Number.isFinite(n) ? n : null;

      if (mode === "category") {
        // Para "HH:MM" usamos eje categórico
        out.push({ x: i, label: t, nivel });
      } else {
        const ms = toMs(t);
        if (!Number.isFinite(ms)) continue; // timestamp inválido
        out.push({ x: ms, label: t, nivel });
      }
    }
    if (mode === "time") out.sort((a, b) => (Number(a.x) as number) - (Number(b.x) as number));
    return out;
  }, [rawT, rawV, mode]);

  const hasData = series.length > 0 && series.some((d) => d.nivel != null);

  // Dominio Y dinámico (mantiene 0..100 por defecto)
  const yMin = useMemo(() => {
    const vals = series.map((d) => (d.nivel == null ? Infinity : d.nivel));
    const m = Math.min(...vals);
    return Number.isFinite(m) ? Math.floor(Math.min(0, m)) : 0;
  }, [series]);

  const yMax = useMemo(() => {
    const vals = series.map((d) => (d.nivel == null ? -Infinity : d.nivel));
    const m = Math.max(...vals);
    return Number.isFinite(m) ? Math.ceil(Math.max(100, m)) : 100;
  }, [series]);

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

      <CardContent className="h-64" style={{ height }}>
        {!hasData ? (
          <div className="h-full grid place-items-center text-sm text-gray-500">Sin datos</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={series} margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
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
                  domain={["dataMin", "dataMax"]}
                  tickFormatter={(v) => fmtTime(v as number, tz)}
                  tickMargin={8}
                  minTickGap={36}
                />
              ) : (
                <XAxis
                  dataKey="label"
                  type="category"
                  tickMargin={8}
                  minTickGap={16}
                />
              )}

              <YAxis domain={[yMin, yMax]} tickFormatter={(v) => `${v}%`} width={40} />

              <Tooltip
                cursor={{ strokeDasharray: "3 3" }}
                content={({ active, payload }) => {
                  if (!active || !payload || !payload.length) return null;
                  const p = payload[0].payload as { x: number | string; label: string; nivel: number | null };
                  const nivel = p.nivel == null ? "--" : `${p.nivel.toFixed(1)}%`;
                  const when = mode === "time" ? fmtTime(Number(p.x)) : String(p.label);
                  return (
                    <div className="rounded-lg border bg-background px-3 py-2 shadow-sm">
                      <div className="text-xs text-muted-foreground">{when}</div>
                      <div className="text-sm font-medium">Nivel: {nivel}</div>
                    </div>
                  );
                }}
              />

              {/* Bandas y líneas de umbral (si están definidas) */}
              {typeof LL === "number" && (
                <ReferenceArea y1={0} y2={LL} fill="var(--destructive)" fillOpacity={0.08} />
              )}
              {typeof HH === "number" && (
                <ReferenceArea y1={HH} y2={Math.max(100, yMax)} fill="var(--destructive)" fillOpacity={0.08} />
              )}
              {typeof L === "number" && typeof H === "number" && H > L && (
                <ReferenceArea y1={L} y2={H} fill="var(--primary)" fillOpacity={0.06} />
              )}

              {typeof LL === "number" && (
                <ReferenceLine
                  y={LL}
                  stroke="currentColor"
                  strokeDasharray="4 4"
                  opacity={0.6}
                  label={{ value: `LL ${LL}%`, position: "insideTopRight", fontSize: 10 }}
                />
              )}
              {typeof L === "number" && (
                <ReferenceLine
                  y={L}
                  stroke="currentColor"
                  strokeDasharray="4 4"
                  opacity={0.5}
                  label={{ value: `L ${L}%`, position: "insideTopRight", fontSize: 10 }}
                />
              )}
              {typeof H === "number" && (
                <ReferenceLine
                  y={H}
                  stroke="currentColor"
                  strokeDasharray="4 4"
                  opacity={0.5}
                  label={{ value: `H ${H}%`, position: "insideTopRight", fontSize: 10 }}
                />
              )}
              {typeof HH === "number" && (
                <ReferenceLine
                  y={HH}
                  stroke="currentColor"
                  strokeDasharray="4 4"
                  opacity={0.6}
                  label={{ value: `HH ${HH}%`, position: "insideTopRight", fontSize: 10 }}
                />
              )}

              <Area
                type="monotone"
                dataKey="nivel"
                stroke="currentColor"
                strokeWidth={2}
                fill={`url(#${gradId})`}
                connectNulls
                dot={false}
                isAnimationActive={false}
              />

              {showLegend && <Legend verticalAlign="top" height={24} />}

              {series.length > showBrushIf && (
                <Brush
                  dataKey={mode === "time" ? "x" : "label"}
                  height={22}
                  stroke="currentColor"
                  travellerWidth={8}
                  tickFormatter={(v) => (mode === "time" ? fmtTime(v as number, tz) : String(v))}
                />
              )}
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
