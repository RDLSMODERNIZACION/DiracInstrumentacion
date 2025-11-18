// src/components/ReliabilityPage.tsx
import React, { useEffect, useMemo, useState } from "react";
import { fetchLocationTimeline, ReliabilityTimelineResponse } from "@/api/reliability";

type Props = {
  // En el Widget lo estás llamando como: locationId={loc === "all" ? "all" : Number(loc)}
  locationId: number | "all";
  thresholdLow?: number; // % mínimo para considerarlo "en verde" (default 90)
  days?: number; // por si después querés cambiar la ventana
  bucketMinutes?: number; // default 60
};

type DayBuckets = {
  dateKey: string;
  label: string;
  buckets: {
    has_data: boolean;
  }[];
};

function formatDateLabel(d: Date) {
  return d.toLocaleDateString("es-AR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  });
}

export default function ReliabilityPage({
  locationId,
  thresholdLow = 90,
  days = 7,
  bucketMinutes = 60,
}: Props) {
  const [data, setData] = useState<ReliabilityTimelineResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const locNumber = locationId === "all" ? undefined : locationId;
        const res = await fetchLocationTimeline({
          locationId: locNumber,
          days,
          bucketMinutes,
        });
        if (cancelled) return;
        setData(res);
        if (!res) {
          setError("No se pudieron cargar los datos de confiabilidad.");
        }
      } catch (e) {
        console.error("[ReliabilityPage] load error:", e);
        if (!cancelled) setError("Error al cargar datos de confiabilidad.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [locationId, days, bucketMinutes]);

  const uptimePct = useMemo(() => {
    if (!data || data.uptime_ratio == null) return null;
    return data.uptime_ratio * 100;
  }, [data]);

  const healthColor = useMemo(() => {
    if (uptimePct == null) return "text-gray-500";
    if (uptimePct >= thresholdLow) return "text-emerald-600";
    if (uptimePct >= thresholdLow - 10) return "text-amber-500";
    return "text-red-500";
  }, [uptimePct, thresholdLow]);

  const grouped: DayBuckets[] = useMemo(() => {
    if (!data || !data.timeline?.length) return [];

    const byDay = new Map<string, DayBuckets>();

    for (const b of data.timeline) {
      const d = new Date(b.bucket_start);
      const dateKey = d.toISOString().slice(0, 10); // yyyy-mm-dd (aprox, suficiente para agrupar)
      const existing = byDay.get(dateKey);
      const entry: DayBuckets =
        existing ??
        {
          dateKey,
          label: formatDateLabel(d),
          buckets: [],
        };

      entry.buckets.push({ has_data: b.has_data });
      if (!existing) byDay.set(dateKey, entry);
    }

    // Ordenamos por fecha ascendente
    const rows = Array.from(byDay.values()).sort((a, b) =>
      a.dateKey.localeCompare(b.dateKey)
    );

    return rows;
  }, [data]);

  const bucketLabel =
    bucketMinutes >= 60
      ? `${bucketMinutes / 60} h`
      : `${bucketMinutes} min`;

  return (
    <div className="space-y-4">
      {/* Encabezado y KPI */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
        <div>
          <div className="text-sm font-medium text-gray-700">
            Operación y confiabilidad
          </div>
          <div className="text-xs text-gray-500">
            Continuidad de datos (bombas y tanques) en los últimos {days} días.
          </div>
        </div>

        <div className="text-right text-sm">
          {uptimePct != null ? (
            <>
              <div className={`font-semibold ${healthColor}`}>
                Confiabilidad {days} días: {uptimePct.toFixed(1)}%
              </div>
              <div className="text-[11px] text-gray-500">
                Resolución: {bucketLabel} por bloque
              </div>
            </>
          ) : loading ? (
            <div className="text-xs text-gray-400">Calculando…</div>
          ) : (
            <div className="text-xs text-gray-400">Sin datos suficientes.</div>
          )}
        </div>
      </div>

      {/* Estado de carga / error */}
      {loading && !data && (
        <div className="text-xs text-gray-400">Cargando timeline…</div>
      )}
      {error && (
        <div className="text-xs text-red-500">{error}</div>
      )}

      {/* Leyenda */}
      <div className="flex items-center gap-4 text-[11px] text-gray-500">
        <div className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-sm bg-emerald-500" />
          <span>Conectado (hubo datos)</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-sm bg-gray-200 border border-gray-300" />
          <span>Sin datos (posible caída / sin operación)</span>
        </div>
      </div>

      {/* Timeline semanal */}
      <div className="border rounded-2xl bg-white p-3 space-y-2">
        {grouped.length === 0 && !loading && (
          <div className="text-xs text-gray-400">
            No hay datos de operación en los últimos {days} días.
          </div>
        )}

        {grouped.map((day) => {
          const cols = day.buckets.length || 1;
          return (
            <div
              key={day.dateKey}
              className="flex items-center gap-2 text-[11px]"
            >
              {/* Etiqueta de día */}
              <div className="w-20 text-right text-gray-500 shrink-0">
                {day.label}
              </div>

              {/* Barras */}
              <div
                className="flex-1 grid gap-[1px]"
                style={{
                  gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                }}
              >
                {day.buckets.map((b, idx) => (
                  <div
                    key={idx}
                    className={`h-3 rounded-sm ${
                      b.has_data
                        ? "bg-emerald-500"
                        : "bg-gray-200 border border-gray-200"
                    }`}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
