// src/components/scada/pages/OverviewGrid.tsx
import React from "react";
import { TankCard, PumpCard } from "../widgets";
import type { ServiceType } from "../hooks/usePlant";

export type ConnStatus = { online: boolean; ageSec: number; tone: "ok" | "warn" | "bad" };

const WARN_SEC =
  Number((import.meta as any).env?.VITE_WS_WARN_SEC ?? (import.meta as any).env?.VITE_STALE_WARN_SEC ?? 120);
const CRIT_SEC =
  Number((import.meta as any).env?.VITE_WS_CRIT_SEC ?? (import.meta as any).env?.VITE_STALE_CRIT_SEC ?? 300);

function secSince(ts?: string | null) {
  if (!ts) return Number.POSITIVE_INFINITY;
  const t = new Date(ts).getTime();
  if (!isFinite(t)) return Number.POSITIVE_INFINITY;
  return Math.max(0, Math.round((Date.now() - t) / 1000));
}
function fallbackFromLatest(ts?: string | null): ConnStatus {
  const ageSec = secSince(ts);
  const tone: ConnStatus["tone"] = ageSec < WARN_SEC ? "ok" : ageSec < CRIT_SEC ? "warn" : "bad";
  return { online: ageSec < CRIT_SEC, ageSec, tone };
}
function preferFresh(ws: ConnStatus | undefined, derived: ConnStatus): ConnStatus {
  if (!ws || !Number.isFinite(ws.ageSec)) return derived;
  return ws.ageSec <= derived.ageSec ? ws : derived;
}

// ========== Tipos ==========
type AssetLocLink =
  | {
      asset_type: "tank" | "pump" | "valve" | "manifold";
      asset_id: number;
      location_id?: number | null;
      code?: string | null;
      name?: string | null;
      location?: { id?: number | null; code?: string | null; name?: string | null } | null;
    };

type GroupItem = { kind: "tank"; obj: any } | { kind: "pump"; obj: any };

type Group = {
  key: string;
  locId: number | null;
  groupName: string;
  groupCode?: string | null;
  // ✅ NUEVO: tipo de servicio del grupo (para pestañas y color)
  serviceType: ServiceType;
  items: GroupItem[];
  tanks: number;
  pumps: number;
};

function accentForGroup(_key: string, serviceType: ServiceType) {
  // ✅ Agua: azul suave (default actual)
  // ✅ Cloacas: verde suave
  if (serviceType === "cloacas") {
    return {
      stripe: "rgba(34,197,94,0.85)", // green-500-ish
      pillBg: "rgba(34,197,94,0.10)",
      pillBd: "rgba(34,197,94,0.35)",
      pillTx: "rgb(15,23,42)",
    };
  }
  return {
    stripe: "rgba(56,189,248,0.95)", // sky-400-ish
    pillBg: "rgba(56,189,248,0.10)",
    pillBd: "rgba(56,189,248,0.35)",
    pillTx: "rgb(15,23,42)",
  };
}

function getLocIdFromAsset(a: any): number | null {
  const cands = [a?.location_id, a?.locationId, a?.loc_id, a?.locId, a?.location?.id, a?.loc?.id];
  for (const v of cands) {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}
function getLocNameFromAsset(a: any): string | null {
  const cands = [a?.location?.name, a?.loc?.name, a?.locationName, a?.location_name];
  for (const v of cands) {
    if (typeof v === "string" && v.trim()) return v;
  }
  return null;
}
function getServiceTypeFromAsset(a: any): ServiceType {
  const cands = [
    a?.service_type,
    a?.serviceType,
    a?.location?.service_type,
    a?.location?.serviceType,
    a?.loc?.service_type,
    a?.loc?.serviceType,
  ];
  for (const v of cands) {
    const s = String(v ?? "").trim().toLowerCase();
    if (s === "cloacas") return "cloacas";
    if (s === "agua") return "agua";
  }
  return "agua";
}

export function OverviewGrid({
  plant,
  onOpenTank,
  onOpenPump,
  badKeys = new Set<string>(),
  warnKeys = new Set<string>(),
  statusByKey,
  assetLocs,
  debug = false,
}: {
  plant: any;
  onOpenTank: (id: string | number) => void;
  onOpenPump: (id: string | number) => void;
  badKeys?: Set<string>;
  warnKeys?: Set<string>;
  statusByKey?: Record<string, ConnStatus>;
  assetLocs?: AssetLocLink[];
  debug?: boolean;
}) {
  const lookupStatus = (prefix: "TK" | "PU", id: string | number): ConnStatus | undefined => {
    const idStr = String(id);
    const keys = prefix === "TK" ? [`tank:${idStr}`, `TK-${idStr}`] : [`pump:${idStr}`, `PU-${idStr}`];
    for (const k of keys) {
      const v = statusByKey?.[k];
      if (v) return v;
    }
    return undefined;
  };

  const tankCardProps = (t: any) => {
    const nid = t.tankId ?? t.id;
    const ws = lookupStatus("TK", nid);
    const derived = fallbackFromLatest(t?.latest?.ts);
    const status = preferFresh(ws, derived);

    const key = String(nid);
    const tone = badKeys.has(key) ? "bad" : warnKeys.has(key) ? "warn" : status.tone;

    // ✅ NUEVO: pasa el serviceType a la card (para que pinte verde si cloacas)
    const serviceType = getServiceTypeFromAsset(t);

    return { status: { ...status, tone }, serviceType };
  };

  const pumpCardProps = (p: any) => {
    const nid = p.pumpId ?? p.id;
    const ws = lookupStatus("PU", nid);
    const derived = fallbackFromLatest(p?.latest?.ts);
    const status = preferFresh(ws, derived);

    const key = String(nid);
    const tone = badKeys.has(key) ? "bad" : warnKeys.has(key) ? "warn" : status.tone;

    // por si querés pintar bombas distinto más adelante
    const serviceType = getServiceTypeFromAsset(p);

    return { status: { ...status, tone }, serviceType };
  };

  const isConnectedItem = React.useCallback(
    (it: GroupItem) => {
      const o = it.obj;
      const nid = o.tankId ?? o.pumpId ?? o.id;
      const ws = lookupStatus(it.kind === "tank" ? "TK" : "PU", nid);
      const derived = fallbackFromLatest(o?.latest?.ts);
      const status = preferFresh(ws, derived);
      return !!status.online;
    },
    [statusByKey]
  );

  // ====== Filtros UI ======
  const [locFilter, setLocFilter] = React.useState<"ALL" | "NONE" | number>("ALL");
  const [showTank, setShowTank] = React.useState(true);
  const [showPump, setShowPump] = React.useState(true);
  const [showAll, setShowAll] = React.useState(false); // default: solo conectados

  // ✅ NUEVO: pestañas Agua | Cloacas
  const [svcTab, setSvcTab] = React.useState<ServiceType>("agua");

  const linkMap = React.useMemo(() => {
    const map = new Map<string, { locId: number | null; code?: string | null; name?: string | null; serviceType?: ServiceType }>();
    (assetLocs ?? []).forEach((l) => {
      const locId =
        Number.isFinite(Number(l.location_id)) && Number(l.location_id) > 0
          ? Number(l.location_id)
          : Number.isFinite(Number(l.location?.id)) && Number(l.location?.id) > 0
          ? Number(l.location?.id)
          : null;
      const code = (l as any).location_code ?? l.code ?? l.location?.code ?? null;
      const name = (l as any).location_name ?? l.name ?? l.location?.name ?? null;

      // si algún día assetLocs también trae service_type
      const stRaw = (l as any).service_type ?? (l as any).serviceType ?? (l as any).location_service_type ?? null;
      const serviceType: ServiceType | undefined =
        String(stRaw ?? "").trim().toLowerCase() === "cloacas" ? "cloacas" : stRaw != null ? "agua" : undefined;

      map.set(`${l.asset_type}:${l.asset_id}`, { locId, code, name, serviceType });
    });
    return map;
  }, [assetLocs]);

  // ====== GRUPOS + ORDEN POR NOMBRE ======
  const groups = React.useMemo(() => {
    const out = new Map<string, Group>();

    const ensureGroup = (
      locId: number | null,
      name?: string | null,
      code?: string | null,
      serviceType: ServiceType = "agua"
    ): Group => {
      const key = locId != null ? `loc:${locId}` : "none";
      let g = out.get(key);
      if (!g) {
        g = {
          key,
          locId,
          groupName: name ?? (locId == null ? "Sin localidad" : `Loc ${locId}`),
          groupCode: code ?? undefined,
          serviceType,
          items: [],
          tanks: 0,
          pumps: 0,
        };
        out.set(key, g);
      } else {
        // si el grupo se creó sin serviceType y luego vemos uno, lo ajustamos
        if (g.serviceType !== "cloacas" && serviceType === "cloacas") g.serviceType = "cloacas";
      }
      return g;
    };

    (plant?.tanks ?? []).forEach((t: any) => {
      const nid = t.tankId ?? t.id;
      const link = linkMap.get(`tank:${nid}`);

      const locId = getLocIdFromAsset(t) ?? link?.locId ?? null;
      const locName = getLocNameFromAsset(t) ?? link?.name ?? undefined;

      const serviceType = getServiceTypeFromAsset(t) ?? link?.serviceType ?? "agua";

      const g = ensureGroup(locId, locName, link?.code ?? undefined, serviceType);
      g.items.push({ kind: "tank", obj: t });
      g.tanks++;
    });

    (plant?.pumps ?? []).forEach((p: any) => {
      const nid = p.pumpId ?? p.id;
      const link = linkMap.get(`pump:${nid}`);

      const locId = getLocIdFromAsset(p) ?? link?.locId ?? null;
      const locName = getLocNameFromAsset(p) ?? link?.name ?? undefined;

      const serviceType = getServiceTypeFromAsset(p) ?? link?.serviceType ?? "agua";

      const g = ensureGroup(locId, locName, link?.code ?? undefined, serviceType);
      g.items.push({ kind: "pump", obj: p });
      g.pumps++;
    });

    for (const g of out.values()) {
      g.items.sort((a, b) => {
        const an = (a.obj?.name ?? a.obj?.display_name ?? a.obj?.code ?? "").toString();
        const bn = (b.obj?.name ?? b.obj?.display_name ?? b.obj?.code ?? "").toString();
        return an.localeCompare(bn, "es", { sensitivity: "base" });
      });
    }

    const list = Array.from(out.values());
    list.sort((a, b) => {
      const an = a.locId == null;
      const bn = b.locId == null;
      if (an !== bn) return an ? 1 : -1;
      return a.groupName.localeCompare(b.groupName, "es", { sensitivity: "base" });
    });

    return list;
  }, [plant?.tanks, plant?.pumps, linkMap]);

  // ✅ NUEVO: contar por servicio para mostrar en las pestañas
  const svcCounts = React.useMemo(() => {
    let agua = 0;
    let cloacas = 0;
    for (const g of groups) {
      if (g.serviceType === "cloacas") cloacas++;
      else agua++;
    }
    return { agua, cloacas };
  }, [groups]);

  const filteredGroups = React.useMemo(() => {
    const res: Group[] = [];
    for (const g of groups) {
      // ✅ filtro por pestaña
      if (g.serviceType !== svcTab) continue;

      if (locFilter !== "ALL") {
        if (locFilter === "NONE" && g.locId !== null) continue;
        if (typeof locFilter === "number" && g.locId !== locFilter) continue;
      }

      let items = g.items.filter((it) => (it.kind === "tank" && showTank) || (it.kind === "pump" && showPump));
      if (!showAll) items = items.filter(isConnectedItem);
      if (!items.length) continue;

      res.push({
        ...g,
        items,
        tanks: items.filter((i) => i.kind === "tank").length,
        pumps: items.filter((i) => i.kind === "pump").length,
      });
    }
    return res;
  }, [groups, svcTab, locFilter, showTank, showPump, showAll, isConnectedItem]);

  // ====== RENDER ======
  const renderItemCard = (it: GroupItem) => {
    if (it.kind === "tank") {
      const t = it.obj;
      const props = tankCardProps(t);
      return (
        <div key={`wrap-t-${t.id}`} className="col-span-1 sm:col-span-2 w-full justify-self-stretch">
          <TankCard tank={t} onClick={() => onOpenTank(t.id)} {...props} />
        </div>
      );
    }
    const p = it.obj;
    const props = pumpCardProps(p);
    return (
      <div key={`wrap-p-${p.id}`} className="col-span-1 w-full justify-self-stretch">
        <PumpCard pump={p} onClick={() => onOpenPump(p.id)} {...props} />
      </div>
    );
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:gap-4 p-3 sm:p-4 rounded-xl border border-slate-200 bg-white/80 backdrop-blur shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-end gap-3 sm:gap-4">
          {/* ✅ NUEVO: Tabs Agua | Cloacas */}
          <div className="flex-1 min-w-0">
            <label className="block text-xs font-medium text-slate-600 mb-1">Servicio</label>
            <div className="inline-flex w-full sm:w-auto rounded-lg border border-slate-300 overflow-hidden shadow-sm">
              <button
                onClick={() => setSvcTab("agua")}
                className={[
                  "flex-1 sm:flex-none px-3 py-2 text-sm transition",
                  svcTab === "agua" ? "bg-slate-900 text-white" : "bg-white text-slate-700 hover:bg-slate-50",
                ].join(" ")}
              >
                Agua <span className="opacity-80">({svcCounts.agua})</span>
              </button>
              <div className="w-px bg-slate-300" />
              <button
                onClick={() => setSvcTab("cloacas")}
                className={[
                  "flex-1 sm:flex-none px-3 py-2 text-sm transition",
                  svcTab === "cloacas" ? "bg-slate-900 text-white" : "bg-white text-slate-700 hover:bg-slate-50",
                ].join(" ")}
              >
                Cloacas <span className="opacity-80">({svcCounts.cloacas})</span>
              </button>
            </div>
          </div>

          {/* Selector ubicación */}
          <div className="flex-1 min-w-0">
            <label className="block text-xs font-medium text-slate-600 mb-1">Ubicación</label>
            <select
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              value={typeof locFilter === "number" ? String(locFilter) : locFilter}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "ALL" || v === "NONE") setLocFilter(v);
                else setLocFilter(Number(v));
              }}
            >
              <option value="ALL">Todas</option>
              <option value="NONE">Sin localidad</option>
              {groups
                .filter((g) => g.locId != null && g.serviceType === svcTab)
                .map((g) => (
                  <option key={g.key} value={String(g.locId)}>
                    {g.groupName}
                  </option>
                ))}
            </select>
          </div>
        </div>

        {/* Botonera responsive */}
        <div className="flex items-center">
          <div className="inline-flex flex-wrap w-full sm:w-auto rounded-lg border border-slate-300 overflow-hidden shadow-sm">
            <button
              onClick={() => setShowTank((v) => !v)}
              className={[
                "flex-1 sm:flex-none px-3 py-2 text-sm transition",
                showTank ? "bg-slate-900 text-white" : "bg-white text-slate-700 hover:bg-slate-50",
              ].join(" ")}
            >
              Tanques
            </button>

            <div className="hidden sm:block w-px bg-slate-300" />

            <button
              onClick={() => setShowPump((v) => !v)}
              className={[
                "flex-1 sm:flex-none px-3 py-2 text-sm transition",
                showPump ? "bg-slate-900 text-white" : "bg-white text-slate-700 hover:bg-slate-50",
              ].join(" ")}
            >
              Bombas
            </button>

            <div className="hidden sm:block w-px bg-slate-300" />

            <button
              onClick={() => setShowAll((v) => !v)}
              className={[
                "w-full sm:w-auto px-3 py-2 text-sm transition whitespace-nowrap border-t sm:border-t-0 border-slate-300 sm:border-0",
                showAll ? "bg-white text-slate-700 hover:bg-slate-50" : "bg-slate-900 text-white",
              ].join(" ")}
            >
              {showAll ? "Todos" : "Solo conectados"}
            </button>
          </div>
        </div>

        {debug ? (
          <div className="text-xs text-slate-600">
            tab=<b>{svcTab}</b> grupos={groups.length} filtrados={filteredGroups.length}
          </div>
        ) : null}
      </div>

      {/* Grupos */}
      <section className="space-y-3 sm:space-y-4">
        {filteredGroups.map((g) => {
          const acc = accentForGroup(g.key, g.serviceType);
          return (
            <div
              key={g.key}
              className="rounded-2xl border border-slate-200 bg-white shadow-sm p-3 sm:p-4"
              style={{ borderLeft: `6px solid ${acc.stripe}` }}
            >
              {/* Header del grupo */}
              <div className="flex items-center justify-between mb-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-900 truncate">
                    {g.groupName}
                    {g.groupCode ? <span className="ml-2 text-xs text-slate-500">({g.groupCode})</span> : null}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span
                    className="px-2 py-1 rounded-full text-xs border"
                    style={{ background: acc.pillBg, borderColor: acc.pillBd, color: acc.pillTx }}
                  >
                    {g.serviceType === "cloacas" ? "Cloacas" : "Agua"}
                  </span>
                  <span className="text-xs text-slate-500">
                    TK {g.tanks} · PU {g.pumps}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8 gap-2 sm:gap-3 items-stretch justify-items-stretch">
                {g.items.map(renderItemCard)}
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}
