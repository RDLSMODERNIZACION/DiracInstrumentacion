import React, { useEffect, useMemo, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import TankLevelChart from "@/components/TankLevelChart";
import OpsPumpsProfile from "@/components/OpsPumpsProfile";
import ByLocationTable from "@/components/ByLocationTable";
import { Tabs } from "@/components/Tabs";

import EnergyEfficiencyPage from "@/components/EnergyEfficiencyPage";
import ReliabilityPage from "@/components/ReliabilityPage";
import ProcesoCalidad from "@/components/ProcesoCalidad";

import { loadDashboard } from "@/data/loadFromApi";
import { k } from "@/utils/format";
import { useLiveOps } from "@/hooks/useLiveOps";
import { listPumps, listTanks } from "@/api/graphs";

import { deriveLocOptions, mergeLocOptions } from "./helpers/locations";
import { usePlayback } from "./hooks/usePlayback";
import { useAudit } from "./hooks/useAudit";
import PlaybackControls from "./components/PlaybackControls";
import BaseSelectors from "./components/BaseSelectors";

import type { LocOpt, PumpInfo, TankInfo } from "./types";

type CombinedOperationEvent = {
  id: string;
  kind: "pump" | "tank";
  tsMs: number;
  ts: string;
  entityName: string;
  locationName?: string | null;
  label: string;
  detail?: string | null;
  severity?: string | null;
  durationLabel?: string | null;
  value?: number | null;
  limitValue?: number | null;
};

function cleanText(v: any): string {
  if (v == null) return "";

  return String(v)
    .replaceAll("crÃ­tico", "crítico")
    .replaceAll("CrÃ­tico", "Crítico")
    .replaceAll("mÃ¡ximo", "máximo")
    .replaceAll("MÃ¡ximo", "Máximo")
    .replaceAll("mÃ­nimo", "mínimo")
    .replaceAll("MÃ­nimo", "Mínimo");
}

function fmtPct(v: any, decimals = 1) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "--";
  return `${n.toFixed(decimals)}%`;
}

function fmtLevel(v: any) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "--";
  return `${n.toFixed(2)}%`;
}

function fmtShortTime(tsMs?: number | null) {
  if (!tsMs || !Number.isFinite(tsMs)) return "--";

  return new Date(tsMs).toLocaleTimeString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function fmtDateTime(tsMs?: number | null) {
  if (!tsMs || !Number.isFinite(tsMs)) return "--";

  return new Date(tsMs).toLocaleString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function severityClass(severity?: string | null) {
  const s = String(severity ?? "").toLowerCase();

  if (s === "critical") return "border-red-200 bg-red-50 text-red-700";
  if (s === "warning") return "border-amber-200 bg-amber-50 text-amber-700";
  if (s === "info") return "border-blue-200 bg-blue-50 text-blue-700";

  return "border-slate-200 bg-slate-50 text-slate-700";
}

function statusPillClass(status?: string | null) {
  const s = String(status ?? "").toLowerCase();

  if (
    s.includes("sin comunicación") ||
    s.includes("crítico") ||
    s.includes("critico") ||
    s.includes("baja disponibilidad") ||
    s.includes("ciclado severo")
  ) {
    return "bg-red-100 text-red-700";
  }

  if (
    s.includes("alerta") ||
    s.includes("alto") ||
    s.includes("bajo") ||
    s.includes("utilización") ||
    s.includes("utilizacion")
  ) {
    return "bg-amber-100 text-amber-700";
  }

  if (s.includes("encendida") || s.includes("run") || s.includes("online")) {
    return "bg-emerald-100 text-emerald-700";
  }

  return "bg-slate-100 text-slate-700";
}

function MiniBadge({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${className}`}
    >
      {children}
    </span>
  );
}

function getTankId(t: any): number {
  return Number(t?.id ?? t?.tank_id);
}

function getPumpId(p: any): number {
  return Number(p?.id ?? p?.pump_id);
}

function getTankName(t: any): string {
  return String(
    t?.name ??
      t?.tank_name ??
      t?.label ??
      (Number.isFinite(getTankId(t)) ? `Tanque ${getTankId(t)}` : "Tanque")
  );
}

function getPumpName(p: any): string {
  return String(
    p?.name ??
      p?.pump_name ??
      p?.label ??
      (Number.isFinite(getPumpId(p)) ? `Bomba ${getPumpId(p)}` : "Bomba")
  );
}

function LocationSelect({
  label,
  value,
  onChange,
  options,
  allowAll = false,
}: {
  label: string;
  value: number | "all" | "";
  onChange: (v: number | "all" | "") => void;
  options: LocOpt[];
  allowAll?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </span>

      <select
        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-400"
        value={value === "" ? "" : value === "all" ? "all" : String(value)}
        onChange={(e) => {
          const v = e.target.value;

          if (v === "") {
            onChange("");
          } else if (v === "all") {
            onChange("all");
          } else {
            onChange(Number(v));
          }
        }}
      >
        {allowAll && <option value="all">Todas las localidades</option>}
        {!allowAll && <option value="">Seleccionar localidad</option>}

        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </div>
  );
}

function EntitySelector<T>({
  title,
  allLabel,
  options,
  selectedIds,
  setSelectedIds,
  getId,
  getName,
}: {
  title: string;
  allLabel: string;
  options: T[];
  selectedIds: number[] | "all";
  setSelectedIds: (v: number[] | "all") => void;
  getId: (v: T) => number;
  getName: (v: T) => string;
}) {
  const cleanOptions = useMemo(
    () =>
      (options ?? [])
        .map((item) => ({
          id: getId(item),
          name: getName(item),
        }))
        .filter((x) => Number.isFinite(x.id)),
    [options, getId, getName]
  );

  const allChecked = selectedIds === "all";

  const selectedCount =
    selectedIds === "all"
      ? cleanOptions.length
      : Array.isArray(selectedIds)
        ? selectedIds.length
        : 0;

  const label =
    selectedIds === "all"
      ? allLabel
      : selectedCount === 0
        ? "Sin selección"
        : `${selectedCount} seleccionado${selectedCount === 1 ? "" : "s"}`;

  return (
    <details className="group rounded-xl border border-slate-200 bg-white">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-sm">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            {title}
          </div>

          <div className="font-medium text-slate-700">{label}</div>
        </div>

        <span className="text-xs text-slate-400 transition-transform group-open:rotate-180">
          ▼
        </span>
      </summary>

      <div className="border-t border-slate-100 p-3">
        <label className="mb-2 flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={allChecked}
            onChange={(e) => {
              setSelectedIds(e.target.checked ? "all" : []);
            }}
          />
          {allLabel}
        </label>

        <div className="max-h-44 space-y-2 overflow-auto rounded-xl bg-slate-50 p-2">
          {cleanOptions.length === 0 ? (
            <div className="text-xs text-slate-400">
              No hay elementos para esta ubicación.
            </div>
          ) : (
            cleanOptions.map(({ id, name }) => {
              const ids = Array.isArray(selectedIds) ? selectedIds : [];
              const checked = selectedIds === "all" || ids.includes(id);

              return (
                <label
                  key={id}
                  className="flex items-center gap-2 rounded-lg bg-white px-2 py-1 text-sm text-slate-700"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={selectedIds === "all"}
                    onChange={(e) => {
                      if (selectedIds === "all") return;

                      const current = Array.isArray(selectedIds)
                        ? selectedIds
                        : [];

                      if (e.target.checked) {
                        setSelectedIds(Array.from(new Set([...current, id])));
                      } else {
                        setSelectedIds(current.filter((x) => x !== id));
                      }
                    }}
                  />

                  <span>{name}</span>
                </label>
              );
            })
          )}
        </div>

        {selectedIds !== "all" && (
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setSelectedIds("all")}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
            >
              Seleccionar todos
            </button>

            <button
              type="button"
              onClick={() => setSelectedIds([])}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
            >
              Limpiar selección
            </button>
          </div>
        )}
      </div>
    </details>
  );
}

function OperationEventFeed({
  events,
  loading,
}: {
  events: CombinedOperationEvent[];
  loading?: boolean;
}) {
  return (
    <Card className="rounded-2xl">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">Eventos operativos recientes</CardTitle>

          {loading && (
            <span className="text-xs text-slate-400">Actualizando...</span>
          )}
        </div>
      </CardHeader>

      <CardContent>
        {events.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
            No hay eventos recientes para el filtro actual.
          </div>
        ) : (
          <div className="space-y-2">
            {events.slice(0, 14).map((ev) => (
              <div
                key={ev.id}
                className={`rounded-xl border p-3 ${severityClass(ev.severity)}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">
                        {fmtShortTime(ev.tsMs)}
                      </span>

                      <MiniBadge
                        className={
                          ev.kind === "tank"
                            ? "bg-sky-100 text-sky-700"
                            : "bg-emerald-100 text-emerald-700"
                        }
                      >
                        {ev.kind === "tank" ? "Tanque" : "Bomba"}
                      </MiniBadge>

                      <span className="font-medium">{ev.entityName}</span>
                    </div>

                    <div className="mt-1 text-sm">
                      {cleanText(ev.label)}

                      {ev.value != null && (
                        <span className="ml-1 font-semibold">
                          {fmtLevel(ev.value)}
                        </span>
                      )}

                      {ev.limitValue != null && (
                        <span className="ml-1 opacity-75">
                          límite {fmtLevel(ev.limitValue)}
                        </span>
                      )}
                    </div>

                    {ev.locationName && (
                      <div className="mt-1 text-xs opacity-70">
                        {ev.locationName}
                      </div>
                    )}
                  </div>

                  <div className="text-right text-xs opacity-75">
                    <div>{fmtDateTime(ev.tsMs)}</div>
                    {ev.durationLabel && <div>{ev.durationLabel}</div>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PumpHealthTable({ items }: { items: any[] }) {
  const rows = (items ?? []).slice(0, 10);

  return (
    <Card className="rounded-2xl">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Estado de bombas</CardTitle>
      </CardHeader>

      <CardContent>
        {rows.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
            Sin datos de bombas para el filtro actual.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="py-2 pr-3">Bomba</th>
                  <th className="py-2 pr-3">Ubicación</th>
                  <th className="py-2 pr-3">Estado</th>
                  <th className="py-2 pr-3">Online</th>
                  <th className="py-2 pr-3 text-right">Arr.</th>
                  <th className="py-2 pr-3 text-right">Disp.</th>
                  <th className="py-2 pr-3">Operativo</th>
                </tr>
              </thead>

              <tbody>
                {rows.map((r) => (
                  <tr key={r.pump_id} className="border-b last:border-b-0">
                    <td className="py-2 pr-3 font-medium">
                      {r.pump_name ?? `Bomba ${r.pump_id}`}
                    </td>

                    <td className="py-2 pr-3 text-slate-500">
                      {r.location_name ?? "--"}
                    </td>

                    <td className="py-2 pr-3">
                      <MiniBadge
                        className={
                          r.current_state === "run"
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-slate-100 text-slate-700"
                        }
                      >
                        {r.current_state_label ?? r.current_state ?? "--"}
                      </MiniBadge>
                    </td>

                    <td className="py-2 pr-3">
                      <MiniBadge
                        className={
                          r.online
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-red-100 text-red-700"
                        }
                      >
                        {r.online ? "Online" : "Offline"}
                      </MiniBadge>
                    </td>

                    <td className="py-2 pr-3 text-right">
                      {Number(r.starts_24h ?? 0)}
                    </td>

                    <td className="py-2 pr-3 text-right">
                      {fmtPct(r.availability_pct_24h)}
                    </td>

                    <td className="py-2 pr-3">
                      <MiniBadge className={statusPillClass(r.estado_operativo)}>
                        {cleanText(r.estado_operativo ?? "normal")}
                      </MiniBadge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TankHealthTable({ items }: { items: any[] }) {
  const rows = (items ?? []).slice(0, 10);

  return (
    <Card className="rounded-2xl">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Estado de tanques</CardTitle>
      </CardHeader>

      <CardContent>
        {rows.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
            Sin datos de tanques para el filtro actual.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="py-2 pr-3">Tanque</th>
                  <th className="py-2 pr-3">Ubicación</th>
                  <th className="py-2 pr-3 text-right">Actual</th>
                  <th className="py-2 pr-3 text-right">Mín. 24h</th>
                  <th className="py-2 pr-3 text-right">Máx. 24h</th>
                  <th className="py-2 pr-3">Online</th>
                  <th className="py-2 pr-3">Operativo</th>
                </tr>
              </thead>

              <tbody>
                {rows.map((r) => (
                  <tr key={r.tank_id} className="border-b last:border-b-0">
                    <td className="py-2 pr-3 font-medium">
                      {r.tank_name ?? `Tanque ${r.tank_id}`}
                    </td>

                    <td className="py-2 pr-3 text-slate-500">
                      {r.location_name ?? "--"}
                    </td>

                    <td className="py-2 pr-3 text-right">
                      {fmtLevel(r.current_level)}
                    </td>

                    <td className="py-2 pr-3 text-right">
                      {fmtLevel(r.min_24h)}
                    </td>

                    <td className="py-2 pr-3 text-right">
                      {fmtLevel(r.max_24h)}
                    </td>

                    <td className="py-2 pr-3">
                      <MiniBadge
                        className={
                          r.online
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-red-100 text-red-700"
                        }
                      >
                        {r.online ? "Online" : "Offline"}
                      </MiniBadge>
                    </td>

                    <td className="py-2 pr-3">
                      <MiniBadge className={statusPillClass(r.estado_operativo)}>
                        {cleanText(r.estado_operativo ?? "normal")}
                      </MiniBadge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function Widget() {
  const [live, setLive] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("operacion");

  const [loc, setLoc] = useState<number | "all">("all");
  const [locOptionsAll, setLocOptionsAll] = useState<LocOpt[]>([]);
  const locId = loc === "all" ? undefined : Number(loc);

  const [pumpOptions, setPumpOptions] = useState<PumpInfo[]>([]);
  const [tankOptions, setTankOptions] = useState<TankInfo[]>([]);
  const [selectedPumpIds, setSelectedPumpIds] = useState<number[] | "all">("all");
  const [selectedTankIds, setSelectedTankIds] = useState<number[] | "all">("all");

  useEffect(() => {
    let mounted = true;

    (async () => {
      setLoading(true);

      try {
        const data = await loadDashboard(loc);
        if (!mounted) return;

        setLive(data);

        const optsNow = deriveLocOptions(data?.locations, data?.byLocation);
        setLocOptionsAll((prev) => mergeLocOptions(prev, optsNow));
      } catch (e) {
        console.error(e);
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [loc]);

  useEffect(() => {
    let mounted = true;

    setPumpOptions([]);
    setTankOptions([]);
    setSelectedPumpIds("all");
    setSelectedTankIds("all");

    (async () => {
      try {
        const [p, t] = await Promise.all([
          listPumps({ locationId: locId }),
          listTanks({ locationId: locId }),
        ]);

        if (!mounted) return;

        setPumpOptions(Array.isArray(p) ? (p as PumpInfo[]) : []);
        setTankOptions(Array.isArray(t) ? (t as TankInfo[]) : []);
      } catch (e) {
        if (!mounted) return;

        console.error("[filters] list error:", e);
        setPumpOptions([]);
        setTankOptions([]);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [locId]);

  const pollMs = tab === "operacion" ? 60_000 : 10 * 60_000;

  const liveSync = useLiveOps({
    locationId: locId,
    periodHours: 24,
    bucket: "5min",
    pollMs,
    pumpIds: selectedPumpIds === "all" ? undefined : selectedPumpIds,
    tankIds: selectedTankIds === "all" ? undefined : selectedTankIds,

    // Optimización: evita pedir timeline-1m, que era el request más pesado.
    loadPumpTimeline: false,

    loadPumpEvents: true,
    loadTankEvents: true,
    limitTimeline: 0,
    limitEvents: 150,
  });

  const playback = usePlayback({
    locId,
    tab,
    liveWindow: liveSync.window,
    livePumpTs: liveSync.pumpTs,
    liveTankTs: liveSync.tankTs,
    selectedPumpIds,
    selectedTankIds,
  });

  const [auditEnabled, setAuditEnabled] = useState(false);

  const [auditLoc, setAuditLoc] = useState<number | "">("");
  const [auditLoc2, setAuditLoc2] = useState<number | "">("");
  const [audit2Enabled, setAudit2Enabled] = useState(false);

  const audit = useAudit({
    enabled: auditEnabled,
    auditLoc,
    domain: playback.domain,
  });

  const audit2 = useAudit({
    enabled: auditEnabled && audit2Enabled,
    auditLoc: auditLoc2,
    domain: playback.domain,
  });

  useEffect(() => {
    if (!auditEnabled) playback.setPlayEnabled(false);
  }, [auditEnabled]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!auditEnabled) return;
    if (auditLoc !== "") return;
    if (!locOptionsAll.length) return;

    const firstDifferent =
      locOptionsAll.find((o) => Number(o.id) !== Number(loc)) ?? locOptionsAll[0];

    if (firstDifferent) {
      setAuditLoc(Number(firstDifferent.id));
    }
  }, [auditEnabled, auditLoc, loc, locOptionsAll]);

  useEffect(() => {
    if (!auditEnabled || !audit2Enabled) return;
    if (auditLoc2 !== "") return;
    if (!locOptionsAll.length) return;

    const firstDifferent =
      locOptionsAll.find(
        (o) =>
          Number(o.id) !== Number(loc) && Number(o.id) !== Number(auditLoc)
      ) ?? locOptionsAll[0];

    if (firstDifferent) {
      setAuditLoc2(Number(firstDifferent.id));
    }
  }, [auditEnabled, audit2Enabled, auditLoc2, loc, auditLoc, locOptionsAll]);

  const byLocation = useMemo(
    () => (Array.isArray(live?.byLocation) ? live.byLocation : []),
    [live?.byLocation]
  );

  const byLocationFiltered = useMemo(() => {
    if (locId == null) return byLocation;
    return byLocation.filter((r: any) => Number(r?.location_id) === locId);
  }, [byLocation, locId]);

  const kpis = useMemo(() => {
    let tanks = 0;
    let pumps = 0;

    for (const r of Array.isArray(byLocationFiltered) ? byLocationFiltered : []) {
      tanks += Number(r?.tanks_count ?? 0);
      pumps += Number(r?.pumps_count ?? 0);
    }

    return { tanks, pumps };
  }, [byLocationFiltered]);

  const tankSummary = liveSync.tanksSummary?.summary;
  const pumpSummary = liveSync.pumpsSummary?.summary;

  const tankHealthRows = useMemo(() => {
    const rows = liveSync.tanksSummary?.items ?? [];

    return [...rows].sort((a: any, b: any) => {
      const score = (r: any) => {
        const sev = String(r?.severity ?? "").toLowerCase();
        const estado = String(r?.estado_operativo ?? "").toLowerCase();

        if (!r?.online) return 0;
        if (sev === "critical") return 1;
        if (estado.includes("crítico") || estado.includes("critico")) return 2;
        if (sev === "warning") return 3;
        if (estado !== "normal") return 4;

        return 9;
      };

      return score(a) - score(b);
    });
  }, [liveSync.tanksSummary?.items]);

  const pumpHealthRows = useMemo(() => {
    const rows = liveSync.pumpsSummary?.items ?? [];

    return [...rows].sort((a: any, b: any) => {
      const score = (r: any) => {
        const estado = String(r?.estado_operativo ?? "").toLowerCase();

        if (!r?.online) return 0;
        if (estado.includes("ciclado")) return 1;
        if (estado.includes("baja")) return 2;
        if (estado.includes("sin marcha")) return 3;
        if (estado.includes("alta")) return 4;

        return 9;
      };

      return score(a) - score(b);
    });
  }, [liveSync.pumpsSummary?.items]);

  const combinedEvents = useMemo<CombinedOperationEvent[]>(() => {
    const pumpEvents =
      liveSync.pumpEvents?.items?.map((e: any) => ({
        id: `pump-${e.id}`,
        kind: "pump" as const,
        tsMs: Number(e.event_ts_ms ?? new Date(e.event_ts).getTime()),
        ts: e.event_ts,
        entityName: e.pump_name ?? `Bomba ${e.pump_id}`,
        locationName: e.location_name,
        label: e.state_label ?? e.state ?? "Evento de bomba",
        detail: e.state,
        severity: e.severity,
        durationLabel: e.duration_label,
        value: null,
        limitValue: null,
      })) ?? [];

    const tankEvents =
      liveSync.tankEvents?.items?.map((e: any) => ({
        id: `tank-${e.id}`,
        kind: "tank" as const,
        tsMs: Number(e.event_ts_ms ?? new Date(e.event_ts).getTime()),
        ts: e.event_ts,
        entityName: e.tank_name ?? `Tanque ${e.tank_id}`,
        locationName: e.location_name,
        label: e.event_label ?? e.event_type ?? "Evento de tanque",
        detail: e.event_type,
        severity: e.severity,
        durationLabel: e.duration_label,
        value: e.detected_value,
        limitValue: e.configured_limit,
      })) ?? [];

    return [...pumpEvents, ...tankEvents]
      .filter((e) => Number.isFinite(e.tsMs))
      .sort((a, b) => b.tsMs - a.tsMs);
  }, [liveSync.pumpEvents?.items, liveSync.tankEvents?.items]);

  const totalPumpsCap = useMemo(() => {
    if (selectedPumpIds !== "all") {
      return selectedPumpIds.length || undefined;
    }

    return (
      pumpSummary?.pumps_total ??
      liveSync.pumpsTotal ??
      (kpis.pumps || undefined)
    );
  }, [selectedPumpIds, pumpSummary?.pumps_total, liveSync.pumpsTotal, kpis.pumps]);

  const auditPumpsCap = useMemo(
    () =>
      audit.selectedPumpIds !== "all"
        ? audit.selectedPumpIds.length || undefined
        : (audit.pumpOptions?.length || 0) || undefined,
    [audit.selectedPumpIds, audit.pumpOptions]
  );

  const auditPumpsCap2 = useMemo(
    () =>
      audit2.selectedPumpIds !== "all"
        ? audit2.selectedPumpIds.length || undefined
        : (audit2.pumpOptions?.length || 0) || undefined,
    [audit2.selectedPumpIds, audit2.pumpOptions]
  );

  const operationLoading = Boolean(liveSync.meta?.isLoading || loading);

  const principalLocName = useMemo(() => {
    if (loc === "all") return "Todas las localidades";

    return (
      locOptionsAll.find((o) => Number(o.id) === Number(loc))?.name ??
      `Ubicación ${loc}`
    );
  }, [loc, locOptionsAll]);

  const auditLocName = useMemo(() => {
    if (auditLoc === "") return "Sin localidad seleccionada";

    return (
      locOptionsAll.find((o) => Number(o.id) === Number(auditLoc))?.name ??
      `Ubicación ${auditLoc}`
    );
  }, [auditLoc, locOptionsAll]);

  const auditLocName2 = useMemo(() => {
    if (auditLoc2 === "") return "Sin localidad seleccionada";

    return (
      locOptionsAll.find((o) => Number(o.id) === Number(auditLoc2))?.name ??
      `Ubicación ${auditLoc2}`
    );
  }, [auditLoc2, locOptionsAll]);

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">Ubicación:</span>

          <select
            className="rounded-xl border p-2 text-sm"
            value={loc === "all" ? "all" : String(loc)}
            onChange={(e) =>
              setLoc(e.target.value === "all" ? "all" : Number(e.target.value))
            }
          >
            <option value="all">Todas</option>

            {locOptionsAll.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </div>

        {tab === "operacion" && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <MiniBadge className="bg-slate-100 text-slate-600">
              24 h
            </MiniBadge>

            <MiniBadge className="bg-slate-100 text-slate-600">
              bucket {liveSync.meta?.bucket ?? "5min"}
            </MiniBadge>

            {liveSync.meta?.lastOkAt && (
              <span>actualizado {fmtShortTime(liveSync.meta.lastOkAt)}</span>
            )}

            {liveSync.meta?.lastErr && (
              <span className="text-red-500">{liveSync.meta.lastErr}</span>
            )}
          </div>
        )}
      </div>

      {(pumpOptions.length > 0 || tankOptions.length > 0) && (
        <BaseSelectors
          pumpOptions={pumpOptions}
          tankOptions={tankOptions}
          selectedPumpIds={selectedPumpIds}
          setSelectedPumpIds={setSelectedPumpIds}
          selectedTankIds={selectedTankIds}
          setSelectedTankIds={setSelectedTankIds}
        />
      )}

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "operacion", label: "Operación" },
          { id: "eficiencia", label: "Eficiencia energética" },
          { id: "confiabilidad", label: "Operación y confiabilidad" },
          { id: "calidad", label: "Proceso y calidad del agua" },
          { id: "gestion", label: "Gestión global" },
        ]}
      />

      {tab === "operacion" && (
        <>
          <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <TankLevelChart
              ts={playback.tankTs}
              syncId="op-sync"
              title={
                playback.playEnabled
                  ? `Principal · Nivel de tanques · ${principalLocName} · Playback 24 h`
                  : `Principal · Nivel de tanques · ${principalLocName} · 24h`
              }
              tz="America/Argentina/Buenos_Aires"
              xDomain={playback.domain}
              xTicks={playback.ticks}
              hoverX={null}
              onHoverX={() => {}}
              showBrushIf={120}
            />

            <OpsPumpsProfile
              pumpsTs={playback.pumpTs}
              max={totalPumpsCap}
              syncId="op-sync"
              title={`Principal · Bombas ON · ${principalLocName} · 24h`}
              tz="America/Argentina/Buenos_Aires"
              xDomain={playback.domain}
              xTicks={playback.ticks}
              hoverX={null}
              onHoverX={() => {}}
            />
          </section>

          <section>
            <Card className="rounded-2xl border-blue-200 bg-blue-50/40">
              <CardHeader className="pb-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle className="text-base text-blue-900">
                    Auditoría comparativa
                  </CardTitle>

                  {auditEnabled && (
                    <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-800">
                      Comparación activa
                    </span>
                  )}
                </div>
              </CardHeader>

              <CardContent>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={auditEnabled}
                      onChange={(e) => setAuditEnabled(e.target.checked)}
                    />
                    Auditar / comparar localidades
                  </label>

                  {auditEnabled && (
                    <button
                      type="button"
                      onClick={() => setAudit2Enabled((v) => !v)}
                      className="rounded-xl border border-blue-200 bg-white px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-50"
                    >
                      {audit2Enabled
                        ? "Quitar segundo auditado"
                        : "Agregar otro auditado"}
                    </button>
                  )}
                </div>

                {auditEnabled && (
                  <div className="mt-4 rounded-2xl border border-blue-200 bg-white p-3">
                    <PlaybackControls
                      disabled={!locId}
                      playEnabled={playback.playEnabled}
                      setPlayEnabled={playback.setPlayEnabled}
                      playDate={playback.playDate}
                      setPlayDate={playback.setPlayDate}
                      minDate={playback.minDate}
                      maxDate={playback.maxDate}
                      prevDay={playback.prevDay}
                      nextDay={playback.nextDay}
                      goToday={playback.goToday}
                      selectedDayLabel={playback.selectedDayLabel}
                      startLabel={playback.startLabel}
                      endLabel={playback.endLabel}
                      loadingPlay={playback.loadingPlay}
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          </section>

          {auditEnabled && (
            <section className="rounded-2xl border-2 border-blue-300 bg-blue-50/30 p-3">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold text-blue-900">
                    Comparación directa
                  </div>

                  <div className="text-xs text-blue-700">
                    Cada fila tiene una sola ubicación. Dentro de cada fila
                    podés seleccionar qué tanques y qué bombas mostrar.
                  </div>
                </div>
              </div>

              <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-3">
                <div className="mb-3">
                  <LocationSelect
                    label="Ubicación principal"
                    value={loc}
                    onChange={(v) => setLoc(v as number | "all")}
                    options={locOptionsAll}
                    allowAll
                  />
                </div>

                <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                  <div>
                    <div className="mb-2 rounded-xl bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700">
                      PRINCIPAL · TANQUES · {principalLocName}
                    </div>

                    <div className="mb-2">
                      <EntitySelector
                        title="Tanques"
                        allLabel="Todos los tanques"
                        options={tankOptions}
                        selectedIds={selectedTankIds}
                        setSelectedIds={setSelectedTankIds}
                        getId={getTankId}
                        getName={getTankName}
                      />
                    </div>

                    <TankLevelChart
                      ts={playback.tankTs}
                      syncId="row-principal-sync"
                      title={`Principal · Nivel de tanques · ${principalLocName}`}
                      tz="America/Argentina/Buenos_Aires"
                      xDomain={playback.domain}
                      xTicks={playback.ticks}
                      hoverX={null}
                      onHoverX={() => {}}
                      showBrushIf={120}
                    />
                  </div>

                  <div>
                    <div className="mb-2 rounded-xl bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700">
                      PRINCIPAL · BOMBAS · {principalLocName}
                    </div>

                    <div className="mb-2">
                      <EntitySelector
                        title="Bombas"
                        allLabel="Todas las bombas"
                        options={pumpOptions}
                        selectedIds={selectedPumpIds}
                        setSelectedIds={setSelectedPumpIds}
                        getId={getPumpId}
                        getName={getPumpName}
                      />
                    </div>

                    <OpsPumpsProfile
                      pumpsTs={playback.pumpTs}
                      max={totalPumpsCap}
                      syncId="row-principal-sync"
                      title={`Principal · Bombas ON · ${principalLocName}`}
                      tz="America/Argentina/Buenos_Aires"
                      xDomain={playback.domain}
                      xTicks={playback.ticks}
                      hoverX={null}
                      onHoverX={() => {}}
                    />
                  </div>
                </div>
              </div>

              <div className="mb-4 rounded-2xl border border-blue-200 bg-white p-3">
                <div className="mb-3">
                  <LocationSelect
                    label="Ubicación auditada 1"
                    value={auditLoc}
                    onChange={(v) => setAuditLoc(v as number | "")}
                    options={locOptionsAll}
                  />
                </div>

                <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                  <div>
                    <div className="mb-2 rounded-xl bg-blue-100 px-3 py-2 text-xs font-semibold text-blue-800">
                      AUDITADO 1 · TANQUES · {auditLocName}
                    </div>

                    <div className="mb-2">
                      <EntitySelector
                        title="Tanques"
                        allLabel="Todos los tanques"
                        options={audit.tankOptions ?? []}
                        selectedIds={audit.selectedTankIds}
                        setSelectedIds={audit.setSelectedTankIds}
                        getId={getTankId}
                        getName={getTankName}
                      />
                    </div>

                    <TankLevelChart
                      ts={audit.tankTs ?? { timestamps: [], level_percent: [] }}
                      syncId="row-audit-1-sync"
                      title={`Auditado 1 · Nivel de tanques · ${auditLocName}`}
                      tz="America/Argentina/Buenos_Aires"
                      xDomain={playback.domain}
                      xTicks={playback.ticks}
                      hoverX={null}
                      onHoverX={() => {}}
                    />
                  </div>

                  <div>
                    <div className="mb-2 rounded-xl bg-blue-100 px-3 py-2 text-xs font-semibold text-blue-800">
                      AUDITADO 1 · BOMBAS · {auditLocName}
                    </div>

                    <div className="mb-2">
                      <EntitySelector
                        title="Bombas"
                        allLabel="Todas las bombas"
                        options={audit.pumpOptions ?? []}
                        selectedIds={audit.selectedPumpIds}
                        setSelectedIds={audit.setSelectedPumpIds}
                        getId={getPumpId}
                        getName={getPumpName}
                      />
                    </div>

                    <OpsPumpsProfile
                      pumpsTs={audit.pumpTs ?? { timestamps: [], is_on: [] }}
                      max={auditPumpsCap}
                      syncId="row-audit-1-sync"
                      title={`Auditado 1 · Bombas ON · ${auditLocName}`}
                      tz="America/Argentina/Buenos_Aires"
                      xDomain={playback.domain}
                      xTicks={playback.ticks}
                      hoverX={null}
                      onHoverX={() => {}}
                    />
                  </div>
                </div>
              </div>

              {audit2Enabled && (
                <div className="rounded-2xl border border-indigo-200 bg-white p-3">
                  <div className="mb-3">
                    <LocationSelect
                      label="Ubicación auditada 2"
                      value={auditLoc2}
                      onChange={(v) => setAuditLoc2(v as number | "")}
                      options={locOptionsAll}
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                    <div>
                      <div className="mb-2 rounded-xl bg-indigo-100 px-3 py-2 text-xs font-semibold text-indigo-800">
                        AUDITADO 2 · TANQUES · {auditLocName2}
                      </div>

                      <div className="mb-2">
                        <EntitySelector
                          title="Tanques"
                          allLabel="Todos los tanques"
                          options={audit2.tankOptions ?? []}
                          selectedIds={audit2.selectedTankIds}
                          setSelectedIds={audit2.setSelectedTankIds}
                          getId={getTankId}
                          getName={getTankName}
                        />
                      </div>

                      <TankLevelChart
                        ts={
                          audit2.tankTs ?? { timestamps: [], level_percent: [] }
                        }
                        syncId="row-audit-2-sync"
                        title={`Auditado 2 · Nivel de tanques · ${auditLocName2}`}
                        tz="America/Argentina/Buenos_Aires"
                        xDomain={playback.domain}
                        xTicks={playback.ticks}
                        hoverX={null}
                        onHoverX={() => {}}
                      />
                    </div>

                    <div>
                      <div className="mb-2 rounded-xl bg-indigo-100 px-3 py-2 text-xs font-semibold text-indigo-800">
                        AUDITADO 2 · BOMBAS · {auditLocName2}
                      </div>

                      <div className="mb-2">
                        <EntitySelector
                          title="Bombas"
                          allLabel="Todas las bombas"
                          options={audit2.pumpOptions ?? []}
                          selectedIds={audit2.selectedPumpIds}
                          setSelectedIds={audit2.setSelectedPumpIds}
                          getId={getPumpId}
                          getName={getPumpName}
                        />
                      </div>

                      <OpsPumpsProfile
                        pumpsTs={
                          audit2.pumpTs ?? { timestamps: [], is_on: [] }
                        }
                        max={auditPumpsCap2}
                        syncId="row-audit-2-sync"
                        title={`Auditado 2 · Bombas ON · ${auditLocName2}`}
                        tz="America/Argentina/Buenos_Aires"
                        xDomain={playback.domain}
                        xTicks={playback.ticks}
                        hoverX={null}
                        onHoverX={() => {}}
                      />
                    </div>
                  </div>
                </div>
              )}
            </section>
          )}

          <section>
            <OperationEventFeed
              events={combinedEvents}
              loading={operationLoading}
            />
          </section>

          <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <TankHealthTable items={tankHealthRows} />
            <PumpHealthTable items={pumpHealthRows} />
          </section>
        </>
      )}

      {tab === "eficiencia" && (
        <section>
          <EnergyEfficiencyPage
            locationId={locId}
            tz="America/Argentina/Buenos_Aires"
          />
        </section>
      )}

      {tab === "confiabilidad" && (
        <ReliabilityPage
          locationId={loc === "all" ? "all" : locId ?? "all"}
          selectedPumpIds={selectedPumpIds}
          selectedTankIds={selectedTankIds}
          thresholdLow={90}
        />
      )}

      {tab === "calidad" && (
        <section>
          <ProcesoCalidad />
        </section>
      )}

      {tab === "gestion" && (
        <section>
          <Card className="rounded-2xl">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Gestión global</CardTitle>
            </CardHeader>

            <CardContent>
              <div className="text-sm text-gray-600">
                Espacio reservado para indicadores globales, seguimiento y
                administración.
              </div>
            </CardContent>
          </Card>
        </section>
      )}

      <section>
        <Card className="rounded-2xl">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base">Resumen por ubicación</CardTitle>
          </CardHeader>

          <CardContent>
            <ByLocationTable rows={byLocationFiltered} />
          </CardContent>
        </Card>
      </section>
    </div>
  );
}