// src/components/scada/pages/OverviewGrid.tsx
import React from "react";
import { SummaryCard } from "../ui";
import { TankCard, PumpCard } from "../widgets";

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

// ========== Tipos para agrupación ==========
type AssetLocLink =
  | {
      asset_type: "tank" | "pump" | "valve" | "manifold";
      asset_id: number;
      // formato plano
      location_id?: number | null;
      code?: string | null;
      name?: string | null;
      // formato anidado (backend nuevo)
      location?: { id?: number | null; code?: string | null; name?: string | null } | null;
    };

type GroupItem =
  | { kind: "tank"; obj: any }
  | { kind: "pump"; obj: any };

type Group = {
  key: string;               // "loc:<id>" o "none"
  locId: number | null;
  groupName: string;         // nombre de localidad o "Sin localidad"
  groupCode?: string | null; // código localidad opcional
  items: GroupItem[];
  tanks: number;
  pumps: number;
};

// hash determinístico (si querés variar colores según grupo)
function hashStr(s: string) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
/** Colores fijos “enterprise”: franja y pill sutil */
function accentForGroup(_key: string) {
  const stripe = "rgba(198, 198, 199, 1)";
  const pillBg = "rgba(15,23,42,0.06)";
  const pillBd = "rgba(15,23,42,0.18)";
  const pillTx = "rgb(15,23,42)";
  return { stripe, pillBg, pillBd, pillTx };
}

// Extrae location_id si viene embebido en el asset (varios shapes tolerados)
function getLocIdFromAsset(a: any): number | null {
  const cands = [
    a?.location_id, a?.locationId, a?.loc_id, a?.locId,
    a?.location?.id, a?.loc?.id,
  ];
  for (const v of cands) {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}
// Extrae el nombre de la ubicación embebido en el asset
function getLocNameFromAsset(a: any): string | null {
  const cands = [
    a?.location?.name, a?.loc?.name, a?.locationName, a?.location_name,
  ];
  for (const v of cands) {
    if (typeof v === "string" && v.trim().length) return v;
  }
  return null;
}

export function OverviewGrid({
  plant,
  onOpenTank,
  onOpenPump,
  badKeys = new Set<string>(),
  warnKeys = new Set<string>(),
  statusByKey,
  assetLocs,               // mapeo asset->location (plano o anidado)
  debug = false,           // logs de agrupación
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
  // Buscar status usando todas las variantes de clave que usamos en ScadaApp
  const lookupStatus = (prefix: "TK" | "PU", id: string | number): ConnStatus | undefined => {
    const idStr = String(id);
    const keys = prefix === "TK"
      ? [`tank:${idStr}`, `TK-${idStr}`]
      : [`pump:${idStr}`, `PU-${idStr}`];
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
    let status = preferFresh(ws, derived);

    const key = String(nid);
    const tone =
      badKeys.has(key) ? ("bad" as const) :
      warnKeys.has(key) ? ("warn" as const) :
      status.tone;
    status = { ...status, tone };

    return { status };
  };

  const pumpCardProps = (p: any) => {
    const nid = p.pumpId ?? p.id;
    const ws = lookupStatus("PU", nid);
    const derived = fallbackFromLatest(p?.latest?.ts);
    let status = preferFresh(ws, derived);

    const key = String(nid);
    const tone =
      badKeys.has(key) ? ("bad" as const) :
      warnKeys.has(key) ? ("warn" as const) :
      status.tone;
    status = { ...status, tone };

    return { status };
  };

  // ====== Filtros UI ======
  // 'ALL' = todas, 'NONE' = sin localidad, o un number (locId)
  const [locFilter, setLocFilter] = React.useState<"ALL" | "NONE" | number>("ALL");
  const [showTank, setShowTank] = React.useState(true);
  const [showPump, setShowPump] = React.useState(true);

  // ====== Mapa de links asset -> location_id + metadatos de localidad ======
  const linkMap = React.useMemo(() => {
    const map = new Map<string, { locId: number | null; code?: string | null; name?: string | null }>();
    (assetLocs ?? []).forEach((l) => {
      // aceptar formato plano o anidado
      const locId: number | null = (() => {
        const a = Number(l.location_id);
        if (Number.isFinite(a) && a > 0) return a;
        const b = Number(l.location?.id);
        if (Number.isFinite(b) && b > 0) return b;
        return null;
      })();
      const code = (l as any).location_code ?? l.code ?? l.location?.code ?? null;
      const name = (l as any).location_name ?? l.name ?? l.location?.name ?? null;

      const key = `${l.asset_type}:${l.asset_id}`;
      map.set(key, { locId, code, name });
    });
    return map;
  }, [assetLocs]);

  // ====== Construcción de grupos por localidad (mezclando tanques y bombas) ======
  const groups = React.useMemo(() => {
    const out = new Map<string, Group>();
    const ensureGroup = (locId: number | null, name?: string | null, code?: string | null): Group => {
      const key = locId != null ? `loc:${locId}` : "none";
      let g = out.get(key);
      if (!g) {
        const groupName = name ?? (locId == null ? "Sin localidad" : `Loc ${locId}`);
        g = {
          key,
          locId,
          groupName,
          groupCode: code ?? undefined,
          items: [],
          tanks: 0,
          pumps: 0,
        };
        out.set(key, g);
      } else {
        // si viene mejor nombre/código más adelante, lo completamos
        if (!g.groupCode && code) g.groupCode = code;
        if ((g.groupName === "Sin localidad" || g.groupName.startsWith("Loc ")) && name) g.groupName = name;
      }
      return g;
    };

    // Tanques
    (plant?.tanks ?? []).forEach((t: any) => {
      const nid = t.tankId ?? t.id;
      const fromAssetId = getLocIdFromAsset(t);
      const fromAssetName = getLocNameFromAsset(t);
      const link = linkMap.get(`tank:${nid}`);
      const chosenId = fromAssetId != null ? fromAssetId : (link ? link.locId : null);
      const chosenName = fromAssetName ?? link?.name ?? undefined;
      const chosenCode = link?.code ?? undefined;

      const g = ensureGroup(chosenId, chosenName, chosenCode);
      g.items.push({ kind: "tank", obj: t });
      g.tanks += 1;

      if (debug) {
        console.groupCollapsed("[OV] tank #", nid);
        console.log({ idFromAsset: fromAssetId, idFromLink: link?.locId ?? null, chosenId, chosenName: g.groupName, groupCode: g.groupCode });
        console.groupEnd();
      }
    });

    // Bombas
    (plant?.pumps ?? []).forEach((p: any) => {
      const nid = p.pumpId ?? p.id;
      const fromAssetId = getLocIdFromAsset(p);
      const fromAssetName = getLocNameFromAsset(p);
      const link = linkMap.get(`pump:${nid}`);
      const chosenId = fromAssetId != null ? fromAssetId : (link ? link.locId : null);
      const chosenName = fromAssetName ?? link?.name ?? undefined;
      const chosenCode = link?.code ?? undefined;

      const g = ensureGroup(chosenId, chosenName, chosenCode);
      g.items.push({ kind: "pump", obj: p });
      g.pumps += 1;

      if (debug) {
        console.groupCollapsed("[OV] pump #", nid);
        console.log({ idFromAsset: fromAssetId, idFromLink: link?.locId ?? null, chosenId, chosenName: g.groupName, groupCode: g.groupCode });
        console.groupEnd();
      }
    });

    // ordenar: con localidad primero, “Sin localidad” al final
    const list = Array.from(out.values());
    list.sort((a, b) => {
      const an = a.locId == null;
      const bn = b.locId == null;
      if (an !== bn) return an ? 1 : -1;
      return a.groupName.localeCompare(b.groupName, "es", { sensitivity: "base" });
    });

    if (debug) {
      const table = list.map(g => ({
        locId: g.locId,
        name: g.groupName,
        code: g.groupCode,
        tanks: g.tanks,
        pumps: g.pumps,
      }));
      console.log("%c[OV] grupos por localidad", "color:#2563eb;font-weight:600");
      console.table(table);
      if (!assetLocs || !assetLocs.length) {
        console.warn("[OV] linkMap vacío: no se pasó assetLocs; dependeremos del location embebido en cada asset.");
      }
    }

    return list;
  }, [plant?.tanks, plant?.pumps, linkMap, debug, assetLocs]);

  // Opciones de ubicación para el selector (derivadas de los grupos)
  const locOptions = React.useMemo(() => {
    const opts: { value: "ALL" | "NONE" | number; label: string }[] = [{ value: "ALL", label: "Todas las ubicaciones" }];
    const seen = new Set<string>();
    for (const g of groups) {
      const key = g.locId == null ? "NONE" : `loc:${g.locId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (g.locId == null) {
        opts.push({ value: "NONE", label: "Sin localidad" });
      } else {
        const label = g.groupCode ? `${g.groupName} (${g.groupCode})` : g.groupName;
        opts.push({ value: g.locId, label });
      }
    }
    return opts;
  }, [groups]);

  // Aplica filtros a los grupos (tipo + ubicación) y recalcula conteos visibles
  const filteredGroups = React.useMemo(() => {
    const wantTank = showTank;
    const wantPump = showPump;
    const res: Group[] = [];
    for (const g of groups) {
      // filtro por ubicación
      if (locFilter !== "ALL") {
        if (locFilter === "NONE") {
          if (g.locId !== null) continue;
        } else {
          if (g.locId !== locFilter) continue;
        }
      }
      // filtro por tipos
      const items = g.items.filter(it => (it.kind === "tank" && wantTank) || (it.kind === "pump" && wantPump));
      if (items.length === 0) continue;
      const tanks = items.filter(i => i.kind === "tank").length;
      const pumps = items.filter(i => i.kind === "pump").length;
      res.push({ ...g, items, tanks, pumps });
    }
    return res;
  }, [groups, locFilter, showTank, showPump]);

  // === KPI: alarmas activas (tanques con alarma != "normal") ===
  const alarmsActive = React.useMemo(() => {
    const tanks = plant?.tanks ?? [];
    let n = 0;
    for (const t of tanks) {
      const alarm = (t.alarm ?? t.alarma ?? null);
      if (alarm === "critico" || alarm === "alerta") n++;
    }
    return n;
  }, [plant?.tanks]);

  const renderItemCard = (it: GroupItem) => {
    if (it.kind === "tank") {
      const t = it.obj;
      return (
        <TankCard
          key={`T-${t.id}`}
          tank={t}
          onClick={() => onOpenTank(t.id)}
          {...tankCardProps(t)}
        />
      );
    }
    const p = it.obj;
    return (
      <PumpCard
        key={`P-${p.id}`}
        pump={p}
        onClick={() => onOpenPump(p.id)}
        {...pumpCardProps(p)}
      />
    );
  };

  return (
    <div className="space-y-6">
      {/* KPIs globales */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <SummaryCard title="Tanques" value={plant?.tanks?.length ?? 0} />
        <SummaryCard title="Bombas" value={plant?.pumps?.length ?? 0} />
        <SummaryCard title="Alarmas activas" value={alarmsActive} />
      </div>

      {/* Toolbar de filtros (bonita) */}
      <div className="flex flex-col sm:flex-row sm:items-end gap-3 sm:gap-4 p-3 sm:p-4 rounded-xl border border-slate-200 bg-white/80 backdrop-blur shadow-sm">
        {/* Selector de ubicación */}
        <div className="flex-1 min-w-[240px]">
          <label className="block text-xs font-medium text-slate-600 mb-1">Ubicación</label>
          <div className="relative">
            <select
              className="w-full appearance-none rounded-lg border border-slate-300 bg-white px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
              value={typeof locFilter === "number" ? String(locFilter) : locFilter}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "ALL" || v === "NONE") setLocFilter(v);
                else setLocFilter(Number(v));
              }}
            >
              {locOptions.map(o => (
                <option key={String(o.value)} value={String(o.value)}>
                  {o.label}
                </option>
              ))}
            </select>

            {/* chevron */}
            <svg className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400"
                viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
            </svg>
          </div>
        </div>

        {/* Segmento Tanques / Bombas */}
        <div className="flex items-center">
          <div className="inline-flex rounded-lg border border-slate-300 overflow-hidden shadow-sm">
            <button
              type="button"
              onClick={() => setShowTank(v => !v)}
              className={[
                "px-3 py-2 text-sm transition",
                showTank ? "bg-slate-900 text-white" : "bg-white text-slate-700 hover:bg-slate-50"
              ].join(" ")}
              title="Mostrar/ocultar tanques"
            >
              Tanques
            </button>
            <div className="w-px bg-slate-300" />
            <button
              type="button"
              onClick={() => setShowPump(v => !v)}
              className={[
                "px-3 py-2 text-sm transition",
                showPump ? "bg-slate-900 text-white" : "bg-white text-slate-700 hover:bg-slate-50"
              ].join(" ")}
              title="Mostrar/ocultar bombas"
            >
              Bombas
            </button>
          </div>
        </div>

        {/* Reset */}
        <div className="sm:ml-auto">
          <button
            type="button"
            className="text-sm rounded-lg border border-slate-300 px-3 py-2 hover:bg-slate-50"
            onClick={() => { setLocFilter("ALL"); setShowTank(true); setShowPump(true); }}
            title="Limpiar filtros"
          >
            Limpiar filtros
          </button>
        </div>
      </div>

      {/* Grupos por localidad, mezclando tanques y bombas (filtrados) */}
      <section className="space-y-4">
        {filteredGroups.map((g) => {
          const acc = accentForGroup(g.key);
          return (
            <div
              key={g.key}
              className="rounded-2xl border border-slate-200 bg-white shadow-sm p-3 sm:p-4"
              style={{ borderLeft: `6px solid ${acc.stripe}` }}
            >
              {/* Cabecera del grupo */}
              <div className="mb-3 pb-2 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span
                    className="text-sm font-semibold px-2.5 py-1 rounded-full"
                    style={{
                      backgroundColor: acc.pillBg,
                      border: `1px solid ${acc.pillBd}`,
                      color: acc.pillTx,
                    }}
                  >
                    {g.groupName}
                  </span>
                  {g.groupCode ? (
                    <span className="text-xs text-slate-500">({g.groupCode})</span>
                  ) : null}
                </div>
                <div className="text-xs text-slate-600 flex items-center gap-2">
                  <span className="rounded-md bg-slate-50 border border-slate-200 px-2 py-0.5">
                    Tanques: <b>{g.tanks}</b>
                  </span>
                  <span className="rounded-md bg-slate-50 border border-slate-200 px-2 py-0.5">
                    Bombas: <b>{g.pumps}</b>
                  </span>
                </div>
              </div>

              {/* Grid de assets mezclados */}
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {g.items.map(renderItemCard)}
              </div>
            </div>
          );
        })}

        {/* Por si el filtro deja todo vacío */}
        {(!filteredGroups || filteredGroups.length === 0) && (
          <div className="text-sm text-slate-500">No hay activos que coincidan con los filtros.</div>
        )}
      </section>
    </div>
  );
}
