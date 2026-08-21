import React, { useEffect, useMemo, useState } from "react";
import TankLevelChart from "@/components/TankLevelChart";
import OpsPumpsProfile, {
  type PumpsTs,
  type PumpTimelineItem,
} from "@/components/OpsPumpsProfile";
import { scopedUrl, getApiHeaders } from "@/lib/config";

type PumpAvailability = {
  id: number;
  name?: string | null;
  location_id?: number | null;
  rol_red?: string | null;
  disponible: boolean;
};

type LayoutNode = {
  node_id?: string;
  id?: number | string;
  type?: string | null;
  name?: string | null;
  online?: boolean | null;
  state?: string | null;
  level_pct?: number | string | null;
  location_id?: number | null;
  location_name?: string | null;
};

type Props = {
  pumpTs?: PumpsTs;
  tankTs?: any;
  pumpTimelineItems?: PumpTimelineItem[];
  xDomain?: [number, number];
  xTicks?: number[];
  pumpSummaryItems?: any[];
  tankSummaryItems?: any[];
  locationLabel?: string;
};

function cleanLocation(v?: string | null) {
  const s = String(v ?? "").trim();
  if (!s) return "Sin ubicación";
  return s.replace(/^\d+[_\s-]*/g, "").trim() || s;
}

function isOn(state?: string | null) {
  const s = String(state ?? "").trim().toLowerCase();
  return ["on", "run", "running", "1", "true", "encendida"].includes(s);
}

function fmtHours(seconds: any) {
  const n = Number(seconds);
  if (!Number.isFinite(n) || n <= 0) return "—";
  return `${(n / 3600).toFixed(1).replace(".", ",")} h`;
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

export default function WaterNetworkOverviewLive({
  pumpTs,
  tankTs,
  pumpTimelineItems = [],
  xDomain,
  xTicks,
  pumpSummaryItems = [],
  tankSummaryItems = [],
  locationLabel = "Todas las localidades",
}: Props) {
  const [availability, setAvailability] = useState<PumpAvailability[]>([]);
  const [layout, setLayout] = useState<LayoutNode[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const [a, l] = await Promise.all([
          getJson<PumpAvailability[]>("/infraestructura/pump_availability"),
          getJson<LayoutNode[]>("/infraestructura/get_layout_combined"),
        ]);

        if (!mounted) return;

        setAvailability(Array.isArray(a) ? a : []);
        setLayout(Array.isArray(l) ? l : []);
        setError("");
      } catch (e: any) {
        if (!mounted) return;
        setError(e?.message || "No se pudo cargar el detalle de red.");
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const pumpLayout = useMemo(() => {
    const m = new Map<number, LayoutNode>();
    for (const n of layout) {
      if (String(n.type ?? "").toLowerCase() !== "pump") continue;
      const id = Number(n.id);
      if (Number.isFinite(id)) m.set(id, n);
    }
    return m;
  }, [layout]);

  const tankLayout = useMemo(() => {
    const m = new Map<number, LayoutNode>();
    for (const n of layout) {
      if (String(n.type ?? "").toLowerCase() !== "tank") continue;
      const id = Number(n.id);
      if (Number.isFinite(id)) m.set(id, n);
    }
    return m;
  }, [layout]);

  const pumpSummaryById = useMemo(() => {
    const m = new Map<number, any>();
    for (const r of pumpSummaryItems ?? []) {
      const id = Number(r?.pump_id ?? r?.id);
      if (Number.isFinite(id)) m.set(id, r);
    }
    return m;
  }, [pumpSummaryItems]);

  const tankSummaryById = useMemo(() => {
    const m = new Map<number, any>();
    for (const r of tankSummaryItems ?? []) {
      const id = Number(r?.tank_id ?? r?.id);
      if (Number.isFinite(id)) m.set(id, r);
    }
    return m;
  }, [tankSummaryItems]);

  const pumpGroups = useMemo(() => {
    const groups = new Map<string, any[]>();

    for (const p of availability.filter(
      (x) => x.rol_red === "impulsion_principal"
    )) {
      const node = pumpLayout.get(Number(p.id));
      const summary = pumpSummaryById.get(Number(p.id));

      const location = cleanLocation(
        node?.location_name ?? summary?.location_name
      );

      const estado =
        summary?.current_state_label ??
        summary?.current_state ??
        (node?.online === false ? "Offline" : isOn(node?.state) ? "ON" : "OFF");

      const row = {
        id: p.id,
        name: p.name || node?.name || `Bomba ${p.id}`,
        location,
        estado: String(estado),
        disponible: p.disponible,
        hours:
          fmtHours(
            summary?.running_seconds_24h ??
              summary?.running_seconds ??
              summary?.run_seconds_24h
          ),
        starts: Number(summary?.starts_24h ?? summary?.starts_count ?? 0),
      };

      if (!groups.has(location)) groups.set(location, []);
      groups.get(location)!.push(row);
    }

    return Array.from(groups.entries()).map(([location, rows]) => ({
      location,
      rows: rows.sort((a, b) => a.name.localeCompare(b.name)),
    }));
  }, [availability, pumpLayout, pumpSummaryById]);

  const tankGroups = useMemo(() => {
    const PRINCIPAL = new Set([7, 8, 9, 10, 11, 12, 21]);
    const groups = new Map<string, any[]>();

    for (const id of PRINCIPAL) {
      const node = tankLayout.get(id);
      const summary = tankSummaryById.get(id);

      if (!node && !summary) continue;

      const location = cleanLocation(
        node?.location_name ?? summary?.location_name
      );

      const levelRaw =
        summary?.current_level_pct ??
        summary?.level_pct ??
        summary?.current_pct ??
        node?.level_pct;

      const level = Number(levelRaw);

      const row = {
        id,
        name:
          summary?.tank_name ??
          summary?.name ??
          node?.name ??
          `Tanque ${id}`,
        location,
        level: Number.isFinite(level) ? level : null,
      };

      if (!groups.has(location)) groups.set(location, []);
      groups.get(location)!.push(row);
    }

    return Array.from(groups.entries()).map(([location, rows]) => ({
      location,
      rows: rows.sort((a, b) => a.name.localeCompare(b.name)),
    }));
  }, [tankLayout, tankSummaryById]);

  return (
    <div className="space-y-5">
      <div>
        <div className="text-2xl font-bold text-slate-900">
          Estado principal de la red
        </div>
        <div className="mt-1 text-sm text-slate-500">
          Impulsión y distribución · {locationLabel}
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-700">
          {error}
        </div>
      )}

      {/* LOS DOS GRÁFICOS ORIGINALES, EN EL TIEMPO */}
      <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="min-w-0">
          <OpsPumpsProfile
            pumpsTs={pumpTs}
            timelineItems={pumpTimelineItems}
            max={12}
            syncId="red-principal-sync"
            title="Impulsión · Bombas principales · 24 h"
            tz="America/Argentina/Buenos_Aires"
            xDomain={xDomain}
            xTicks={xTicks}
            hoverX={null}
            onHoverX={() => {}}
          />
        </div>

        <div className="min-w-0">
          <TankLevelChart
            ts={tankTs}
            syncId="red-principal-sync"
            title="Distribución · Tanques principales · 24 h"
            tz="America/Argentina/Buenos_Aires"
            xDomain={xDomain}
            xTicks={xTicks}
            hoverX={null}
            onHoverX={() => {}}
            showBrushIf={120}
          />
        </div>
      </section>

      {/* DETALLE SUTIL ABAJO */}
      <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3">
            <div className="text-sm font-bold text-slate-800">
              Bombas de impulsión
            </div>
            <div className="text-xs text-slate-400">
              Agrupadas por localidad
            </div>
          </div>

          <div className="space-y-3">
            {pumpGroups.map((group) => (
              <div
                key={group.location}
                className="overflow-hidden rounded-xl border border-slate-200"
              >
                <div className="bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700">
                  {group.location}
                </div>

                <div className="divide-y divide-slate-100">
                  {group.rows.map((r) => (
                    <div
                      key={r.id}
                      className="grid grid-cols-[minmax(0,1.3fr)_75px_105px_70px_55px] items-center gap-2 px-3 py-2 text-xs"
                    >
                      <div className="truncate font-medium text-slate-800">
                        {r.name}
                      </div>

                      <div
                        className={
                          String(r.estado).toLowerCase().includes("on") ||
                          String(r.estado).toLowerCase().includes("encendida") ||
                          String(r.estado).toLowerCase().includes("run")
                            ? "font-semibold text-emerald-700"
                            : String(r.estado).toLowerCase().includes("offline")
                            ? "font-semibold text-red-600"
                            : "font-semibold text-slate-500"
                        }
                      >
                        {r.estado}
                      </div>

                      <div>
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                            r.disponible
                              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                              : "border-red-200 bg-red-50 text-red-700"
                          }`}
                        >
                          {r.disponible ? "Disponible" : "No disponible"}
                        </span>
                      </div>

                      <div className="text-slate-500">{r.hours}</div>
                      <div className="text-right text-slate-500">
                        {r.starts || "—"}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3">
            <div className="text-sm font-bold text-slate-800">
              Tanques de distribución
            </div>
            <div className="text-xs text-slate-400">
              Principales: Hormigón, TK 1000, TK1, TK2, TK3, Pulmón y TK 160
            </div>
          </div>

          <div className="space-y-3">
            {tankGroups.map((group) => (
              <div
                key={group.location}
                className="overflow-hidden rounded-xl border border-slate-200"
              >
                <div className="bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700">
                  {group.location}
                </div>

                <div className="divide-y divide-slate-100">
                  {group.rows.map((r) => (
                    <div
                      key={r.id}
                      className="grid grid-cols-[minmax(0,1fr)_85px] items-center gap-3 px-3 py-2 text-xs"
                    >
                      <div className="font-medium text-slate-800">{r.name}</div>
                      <div className="text-right font-bold text-slate-900">
                        {r.level == null ? "—" : `${r.level.toFixed(1)}%`}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
