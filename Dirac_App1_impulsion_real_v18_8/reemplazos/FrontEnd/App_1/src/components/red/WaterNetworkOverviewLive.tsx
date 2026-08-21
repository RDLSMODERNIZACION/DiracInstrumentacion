import React, { useEffect, useMemo, useState } from "react";
import { scopedUrl, getApiHeaders } from "@/lib/config";

type PumpAvailability = {
  id: number;
  name?: string | null;
  location_id?: number | null;
  rol_red?: string | null;
  disponible: boolean;
  disponibilidad_actualizada_at?: string | null;
};

type LayoutNode = {
  node_id: string;
  id: number;
  type: string;
  name?: string | null;
  online?: boolean | null;
  state?: string | null;
  location_id?: number | null;
  location_name?: string | null;
};

function isRunning(state?: string | null) {
  const s = String(state ?? "").toLowerCase();
  return ["run", "running", "on", "1", "true"].includes(s);
}

function statusLabel(node?: LayoutNode) {
  if (!node) return "SIN DATO";
  if (node.online === false) return "OFFLINE";
  return isRunning(node.state) ? "ON" : "OFF";
}

function statusClass(label: string) {
  if (label === "ON") return "text-emerald-700";
  if (label === "OFFLINE") return "text-red-700";
  return "text-slate-500";
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(scopedUrl(path), {
    method: "GET",
    headers: getApiHeaders(),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `Error ${res.status}`);
  }

  return res.json();
}

export default function WaterNetworkOverviewLive() {
  const [availability, setAvailability] = useState<PumpAvailability[]>([]);
  const [layoutNodes, setLayoutNodes] = useState<LayoutNode[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        setError("");

        const [a, n] = await Promise.all([
          getJson<PumpAvailability[]>("/infraestructura/pump_availability"),
          getJson<LayoutNode[]>("/infraestructura/get_layout_combined"),
        ]);

        if (!active) return;

        setAvailability(Array.isArray(a) ? a : []);
        setLayoutNodes(Array.isArray(n) ? n : []);
        setLastUpdate(new Date());
      } catch (e: any) {
        if (!active) return;
        setError(e?.message || "No se pudieron cargar las bombas de impulsión.");
      } finally {
        if (active) setLoading(false);
      }
    }

    load();
    const timer = window.setInterval(load, 15000);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  const nodesByPumpId = useMemo(() => {
    const map = new Map<number, LayoutNode>();

    for (const n of layoutNodes) {
      if (String(n.type).toLowerCase() !== "pump") continue;
      const id = Number(n.id);
      if (Number.isFinite(id)) map.set(id, n);
    }

    return map;
  }, [layoutNodes]);

  const rows = useMemo(() => {
    return [...availability]
      .filter((p) => p.rol_red === "impulsion_principal")
      .sort((a, b) => {
        const na = nodesByPumpId.get(a.id);
        const nb = nodesByPumpId.get(b.id);

        const la = String(na?.location_name ?? "");
        const lb = String(nb?.location_name ?? "");

        return la.localeCompare(lb) || a.id - b.id;
      })
      .map((p) => {
        const node = nodesByPumpId.get(p.id);
        const estado = statusLabel(node);

        return {
          ...p,
          node,
          estado,
          operando: estado === "ON",
        };
      });
  }, [availability, nodesByPumpId]);

  const total = rows.length;
  const disponibles = rows.filter((r) => r.disponible).length;
  const noDisponibles = total - disponibles;
  const operando = rows.filter((r) => r.operando).length;
  const offline = rows.filter((r) => r.estado === "OFFLINE").length;

  const utilizacion =
    disponibles > 0 ? Math.round((operando / disponibles) * 100) : 0;

  const disponibilidad =
    total > 0 ? Math.round((disponibles / total) * 100) : 0;

  const estadoGeneral =
    total === 0
      ? "SIN DATOS"
      : disponibilidad < 75
      ? "ATENCIÓN"
      : utilizacion >= 90
      ? "EXIGIDA"
      : "NORMAL";

  const generalClass =
    estadoGeneral === "NORMAL"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : estadoGeneral === "EXIGIDA"
      ? "border-amber-200 bg-amber-50 text-amber-700"
      : "border-red-200 bg-red-50 text-red-700";

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
          <div>
            <div className="text-2xl font-bold text-slate-900">Impulsión</div>
            <div className="mt-1 text-sm text-slate-500">
              12 bombas principales de la red de agua
            </div>
          </div>

          <div className="text-right text-xs text-slate-400">
            {lastUpdate
              ? `actualizado ${lastUpdate.toLocaleTimeString("es-AR", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}`
              : loading
              ? "cargando..."
              : ""}
          </div>
        </div>

        {error && (
          <div className="mx-5 mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 border-t border-slate-100 p-5 md:grid-cols-5">
          <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
            <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-blue-500">
              Operando
            </div>
            <div className="mt-1 text-4xl font-black text-blue-700">
              {operando} / {total || 12}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
              Disponibles
            </div>
            <div className="mt-1 text-4xl font-black text-slate-900">
              {disponibles}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
              No disponibles
            </div>
            <div className="mt-1 text-4xl font-black text-slate-900">
              {noDisponibles}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
              Utilización
            </div>
            <div className="mt-1 text-4xl font-black text-slate-900">
              {utilizacion}%
            </div>
            <div className="mt-1 text-[11px] text-slate-400">
              sobre disponibles
            </div>
          </div>

          <div className={`rounded-2xl border p-4 ${generalClass}`}>
            <div className="text-[10px] font-bold uppercase tracking-[0.14em] opacity-70">
              Estado
            </div>
            <div className="mt-2 text-xl font-black">{estadoGeneral}</div>
            {offline > 0 && (
              <div className="mt-1 text-[11px] font-medium">
                {offline} sin comunicación
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <div className="text-base font-bold text-slate-900">
              Bombas principales
            </div>
            <div className="text-xs text-slate-400">
              Estado actual y disponibilidad operativa
            </div>
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-4 py-3">Bomba</th>
                <th className="px-4 py-3">Ubicación</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3">Disponibilidad</th>
                <th className="px-4 py-3">h encendida 24h</th>
                <th className="px-4 py-3">Arranques 24h</th>
              </tr>
            </thead>

            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-semibold text-slate-800">
                    {r.name || `Bomba ${r.id}`}
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {r.node?.location_name || "—"}
                  </td>
                  <td className={`px-4 py-3 font-semibold ${statusClass(r.estado)}`}>
                    <span className="inline-flex items-center gap-2">
                      <span
                        className={`h-2.5 w-2.5 rounded-full ${
                          r.estado === "ON"
                            ? "bg-emerald-500"
                            : r.estado === "OFFLINE"
                            ? "bg-red-500"
                            : "bg-slate-400"
                        }`}
                      />
                      {r.estado}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${
                        r.disponible
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : "border-red-200 bg-red-50 text-red-700"
                      }`}
                    >
                      {r.disponible ? "Disponible" : "No disponible"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-400">—</td>
                  <td className="px-4 py-3 text-slate-400">—</td>
                </tr>
              ))}

              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                    No se encontraron bombas marcadas como impulsión principal.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-3 text-xs text-slate-400">
          La disponibilidad se edita desde App_2 en modo Editar. Las horas de
          marcha y arranques se conectarán al historial de 24 h en el siguiente paso.
        </div>
      </section>
    </div>
  );
}
