import React, { useEffect, useMemo, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "./ui/card";
import { fetchActiveAlarms, AlarmsBySevRow } from "@/api/kpi";

type Props = {
  /** Si lo pasás, filtra por esa localidad; si no, trae todas */
  locationId?: number | "all";
  /** Ms de auto-refresh. Ej: 30000 = 30s. Si no lo pasás, no refresca solo. */
  refreshMs?: number;
};

type Row = {
  location_id?: number | null;
  location_name: string;
  counts: Record<string, number>; // por severidad
  total: number;
};

const ORDER = ["critical", "warning", "info"] as const;

function orderSeverities(all: string[]) {
  const lower = [...new Set(all.map((s) => String(s || "").toLowerCase()))];
  const pref = ORDER.filter((s) => lower.includes(s));
  const rest = lower.filter((s) => !ORDER.includes(s as any)).sort();
  return [...pref, ...rest];
}

export function ActiveAlarms({ locationId, refreshMs }: Props) {
  const [rows, setRows] = useState<AlarmsBySevRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    try {
      setLoading(true);
      setErr(null);
      const data = await fetchActiveAlarms({ location_id: locationId });
      setRows(data);
    } catch (e: any) {
      setErr(e?.message || "Error al cargar alarmas");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!mounted) return;
      await load();
    })();
    let timer: any;
    if (refreshMs && refreshMs > 0) {
      timer = setInterval(load, refreshMs);
    }
    return () => {
      mounted = false;
      if (timer) clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationId, refreshMs]);

  // Agrupar por location y acumular por severidad
  const { grouped, severities, totals } = useMemo(() => {
    const g = new Map<number | "all", Row>();
    const sevSet = new Set<string>();
    let totalAll = 0;

    for (const r of rows || []) {
      const sev = String(r.severity || "").toLowerCase() || "unknown";
      sevSet.add(sev);
      const key = (r.location_id ?? "all") as number | "all";
      const locName = r.location_name || (key === "all" ? "Todas" : `Loc ${key}`);

      const row = g.get(key) || { location_id: r.location_id, location_name: locName, counts: {}, total: 0 };
      const c = Number(r.count ?? 0);
      row.counts[sev] = (row.counts[sev] || 0) + (Number.isFinite(c) ? c : 0);
      row.total += Number.isFinite(c) ? c : 0;
      g.set(key, row);
      totalAll += Number.isFinite(c) ? c : 0;
    }

    const sevList = orderSeverities([...sevSet]);

    // Orden: desc por total
    const arr = [...g.values()].sort((a, b) => (b.total ?? 0) - (a.total ?? 0));

    return { grouped: arr, severities: sevList, totals: totalAll };
  }, [rows]);

  return (
    <Card className="rounded-2xl">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Alarmas activas</CardTitle>
      </CardHeader>
      <CardContent>
        {loading && <div className="text-sm text-gray-500">Cargando…</div>}
        {err && <div className="text-sm text-red-600">{err}</div>}
        {!loading && !err && (!rows || rows.length === 0) && (
          <div className="text-sm text-gray-500">Sin alarmas activas.</div>
        )}

        {!loading && !err && rows && rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm border-collapse">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="p-3 text-left">Localidad</th>
                  {severities.map((s) => (
                    <th key={s} className="p-3 text-right capitalize">
                      {s}
                    </th>
                  ))}
                  <th className="p-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {grouped.map((r, i) => (
                  <tr key={`${r.location_id ?? "all"}-${i}`} className="border-t">
                    <td className="p-3">{r.location_name}</td>
                    {severities.map((s) => (
                      <td key={s} className="p-3 text-right">
                        {r.counts[s] ?? 0}
                      </td>
                    ))}
                    <td className="p-3 text-right font-medium">{r.total}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t bg-gray-50">
                  <td className="p-3 font-medium">Total</td>
                  {severities.map((s) => {
                    const sum = grouped.reduce((acc, r) => acc + (r.counts[s] ?? 0), 0);
                    return (
                      <td key={s} className="p-3 text-right font-medium">
                        {sum}
                      </td>
                    );
                  })}
                  <td className="p-3 text-right font-semibold">{totals}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default ActiveAlarms;
