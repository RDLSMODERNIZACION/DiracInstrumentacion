// src/components/PumpsOnChart.tsx
import React, { useMemo } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "../components/ui/card";
import {
  ResponsiveContainer,
  BarChart,
  LineChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  Bar,
  Line,
  ReferenceLine,
  ReferenceArea,
  Brush,
} from "recharts";

type PumpSeries = { timestamps?: string[]; is_on?: Array<boolean | number | string | null> };
type PerPump = Record<string, PumpSeries>;
type Agg = { timestamps?: string[]; is_on?: number[] };
const isAgg = (x: any): x is Agg => x && Array.isArray(x.timestamps) && Array.isArray(x.is_on);

type PumpEvent = { ts: string | number | Date; type: "start" | "stop"; label?: string };

type Props = {
  pumpsTs: PerPump | Agg | null | undefined;
  title?: string;
  tz?: string;              // default "America/Argentina/Buenos_Aires"
  height?: number;          // default 224
  max?: number;             // capacidad total de bombas; si falta y es per-pump, se deduce
  showLegend?: boolean;     // default true
  showBrushIf?: number;     // default 120 (si hay más de N puntos se muestra brush)
  events?: PumpEvent[];     // opcional: marcas verticales
  variant?: "bar" | "line"; // default "bar"
};

const isHourLabel = (s: string) => /^\d{2}:\d{2}$/.test(s); // "HH:MM"
const toMs = (x: string | number | Date) => (x instanceof Date ? x.getTime() : new Date(x).getTime());
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

const truthyOn = (v: any) =>
  v === true || v === 1 || v === "1" || (typeof v === "string" && v.toLowerCase() === "true");

export default function PumpsOnChart({
  pumpsTs,
  title = "Bombas encendidas (24h)",
  tz = "America/Argentina/Buenos_Aires",
  height = 224,
  max,
  showLegend = true,
  showBrushIf = 120,
  events = [],
  variant = "bar",
}: Props) {
  // -----------------------------
  // 1) Agregación y detección de modo de eje X
  // -----------------------------
  const { series, mode, capacity } = useMemo(() => {
    let labels: string[] = [];
    let counts = new Map<string, number>();
    let candidateCapacity = max ?? 0;

    if (isAgg(pumpsTs)) {
      const ts = pumpsTs.timestamps ?? [];
      const on = pumpsTs.is_on ?? [];
      labels = ts.map((t) => String(t ?? ""));
      labels.forEach((t, i) => counts.set(t, Number(on[i] ?? 0)));
      // en modo agregado no sabemos capacidad si no la pasan
    } else {
      // per-pump: unimos todas las marcas de tiempo presentes
      const entries = Object.entries((pumpsTs as PerPump) || {});
      candidateCapacity = max ?? Math.max(candidateCapacity, entries.length);

      // recolectamos todas las marcas
      const set = new Set<string>();
      for (const [, p] of entries) {
        const ts = p?.timestamps ?? [];
        ts.forEach((t) => set.add(String(t ?? "")));
      }
      labels = Array.from(set);

      // sumamos ON por timestamp
      counts = new Map(labels.map((t) => [t, 0]));
      for (const [, p] of entries) {
        const ts = p?.timestamps ?? [];
        const on = p?.is_on ?? [];
        const N = Math.min(ts.length, on.length);
        for (let i = 0; i < N; i++) {
          const t = String(ts[i] ?? "");
          const v = on[i];
          if (!t) continue;
          counts.set(t, (counts.get(t) ?? 0) + (truthyOn(v) ? 1 : 0));
        }
      }
    }

    const mode: "category" | "time" = labels.length && labels.every((t) => isHourLabel(t)) ? "category" : "time";

    // Construimos serie final
    let series: Array<{ x: number | string; label: string; on: number }> = labels.map((t) => {
      const n = Number(counts.get(t) ?? 0);
      return mode === "time"
        ? { x: toMs(t), label: t, on: n }
        : { x: labels.indexOf(t), label: t, on: n }; // índice como x para brush, label para el eje
    });

    // Orden cronológico
    series =
      mode === "time"
        ? series
            .filter((d) => Number.isFinite(d.x as number))
            .sort((a, b) => (a.x as number) - (b.x as number))
        : [...series].sort((a, b) => String(a.label).localeCompare(String(b.label))); // "00:00".."23:00"

    return { series, mode, capacity: candidateCapacity || undefined };
  }, [pumpsTs, max]);

  const hasData = series.length > 0;
  const yMaxData = Math.max(0, ...series.map((d) => d.on));
  const yMax = Math.max(1, yMaxData, capacity ?? 0);

  // Normalizamos eventos para ReferenceLine
  const marks = useMemo(
    () =>
      (events || []).map((e) => ({
        x: toMs(e.ts),
        label: e.label || (e.type === "start" ? "start" : "stop"),
        color: e.type === "start" ? "#22c55e" : "#ef4444", // verde / rojo
      })),
    [events]
  );

  // -----------------------------
  // 2) Render
  // -----------------------------
  return (
    <Card className="rounded-2xl">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm text-gray-500">{title}</CardTitle>
      </CardHeader>

      <CardContent className="h-56" style={{ height }}>
        {!hasData ? (
          <div className="h-full grid place-items-center text-sm text-gray-500">
            Sin datos de estado para bombas.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            {variant === "line" ? (
              <LineChart data={series} margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
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
                  <XAxis dataKey="label" type="category" tickMargin={8} minTickGap={16} />
                )}
                <YAxis allowDecimals={false} domain={[0, yMax]} width={28} />

                <Tooltip
                  cursor={{ strokeDasharray: "3 3" }}
                  content={({ active, payload }) => {
                    if (!active || !payload || !payload.length) return null;
                    const p = payload[0].payload as { x: number | string; label: string; on: number };
                    const when = mode === "time" ? fmtTime(Number(p.x), tz) : String(p.label);
                    return (
                      <div className="rounded-lg border bg-background px-3 py-2 shadow-sm">
                        <div className="text-xs text-muted-foreground">{when}</div>
                        <div className="text-sm font-medium">Bombas ON: {p.on}</div>
                      </div>
                    );
                  }}
                />

                {/* Línea escalonada */}
                <Line type="stepAfter" dataKey="on" stroke="currentColor" strokeWidth={2} dot={false} isAnimationActive={false} />

                {/* Capacidad (si la conocemos) */}
                {capacity != null && capacity > 0 && (
                  <ReferenceLine
                    y={capacity}
                    stroke="currentColor"
                    strokeDasharray="4 4"
                    opacity={0.5}
                    label={{ value: `cap ${capacity}`, position: "top", fontSize: 10 }}
                  />
                )}

                {/* Eventos verticales */}
                {mode === "time" &&
                  marks.map((m, i) => (
                    <ReferenceLine
                      key={i}
                      x={m.x}
                      stroke={m.color}
                      strokeDasharray="4 4"
                      label={{ value: m.label, position: "top", fontSize: 10 }}
                    />
                  ))}

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
              </LineChart>
            ) : (
              <BarChart data={series} margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
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
                  <XAxis dataKey="label" type="category" tickMargin={8} minTickGap={16} />
                )}
                <YAxis allowDecimals={false} domain={[0, yMax]} width={28} />

                <Tooltip
                  cursor={{ fillOpacity: 0.05 }}
                  content={({ active, payload }) => {
                    if (!active || !payload || !payload.length) return null;
                    const p = payload[0].payload as { x: number | string; label: string; on: number };
                    const when = mode === "time" ? fmtTime(Number(p.x), tz) : String(p.label);
                    return (
                      <div className="rounded-lg border bg-background px-3 py-2 shadow-sm">
                        <div className="text-xs text-muted-foreground">{when}</div>
                        <div className="text-sm font-medium">Bombas ON: {p.on}</div>
                      </div>
                    );
                  }}
                />

                {/* Banda ligera para capacidad */}
                {capacity != null && capacity > 0 && (
                  <ReferenceArea y1={capacity} y2={Math.max(capacity, yMax)} fill="currentColor" fillOpacity={0.05} />
                )}
                {capacity != null && capacity > 0 && (
                  <ReferenceLine
                    y={capacity}
                    stroke="currentColor"
                    strokeDasharray="4 4"
                    opacity={0.5}
                    label={{ value: `cap ${capacity}`, position: "top", fontSize: 10 }}
                  />
                )}

                <Bar dataKey="on" name="Bombas ON" isAnimationActive={false} fill="currentColor" />

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
              </BarChart>
            )}
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
