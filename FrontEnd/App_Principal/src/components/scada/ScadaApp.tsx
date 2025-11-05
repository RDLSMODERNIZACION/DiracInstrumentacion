// src/components/scada/ScadaApp.tsx
import React from "react";
import type { User } from "./types";
import { Drawer, NavItem, KpiPill, Badge } from "./ui";
import { OverviewGrid } from "./pages";
import { sevMeta, severityOf } from "./utils";
import { usePlant } from "./hooks/usePlant";
import { TankFaceplate } from "./faceplates/TankFaceplate";
import { PumpFaceplate } from "./faceplates/PumpFaceplate";
import EmbeddedAppFrame from "./scada/EmbeddedSidebar";
import LogoutButton from "../auth/LogoutButton";

const DEFAULT_THRESHOLDS = { lowCritical: 10, lowWarning: 25, highWarning: 80, highCritical: 90 };

// === umbrales de conectividad (coincidir con backend) ===
const ONLINE_DEAD_SEC = 60;   // <= 60s = online
const ONLINE_WARN_SEC = 120;  // >60 y <=120 = warn

type View = "operaciones" | "kpi" | "infra";

const app1Src = import.meta.env.DEV
  ? (import.meta.env.VITE_APP1_DEV ?? "http://localhost:5174/")
  : "/kpi/";

const app2Src = import.meta.env.DEV
  ? (import.meta.env.VITE_APP2_DEV ?? "http://localhost:5175/")
  : "/infraestructura/";

export default function ScadaApp({ initialUser }: { initialUser?: User }) {
  const [drawer, setDrawer] = React.useState<{ type: "tank" | "pump" | null; id?: string | number | null }>({ type: null });
  // El usuario viene desde AppRoot (derivado de /dirac/me/locations). Fallback viewer simple.
  const [user] = React.useState<User>(
    initialUser ||
      ({
        id: "me",
        name: "usuario",
        role: "viewer",
      } as unknown as User)
  );
  const [view, setView] = React.useState<View>("operaciones"); // 👈 vista actual

  // 🔁 Pausar polling cuando hay faceplate abierto o no estamos en "operaciones"
  const pollMs = drawer.type || view !== "operaciones" ? 0 : 1000;

  const { plant, loading, err, kpis } = usePlant(pollMs);

  // === statusByKey para tanques y bombas ===
  const statusByKey = React.useMemo(() => {
    const s: Record<string, { online: boolean; ageSec: number; tone: "ok" | "warn" | "bad" }> = {};

    // Tanques
    for (const t of plant.tanks || []) {
      const id = (t as any).id ?? (t as any).tank_id;
      if (id == null) continue;

      const rawAge =
        Number.isFinite((t as any).ageSec) ? (t as any).ageSec :
        Number.isFinite((t as any).age_sec) ? (t as any).age_sec :
        null;
      const age = rawAge !== null ? Number(rawAge) : null;
      const online = typeof (t as any).online === "boolean" ? (t as any).online : (age !== null ? age <= ONLINE_DEAD_SEC : false);
      const tone: "ok" | "warn" | "bad" = online ? "ok" : (age !== null && age <= ONLINE_WARN_SEC ? "warn" : "bad");

      s[`tank:${id}`] = { online, ageSec: age ?? 999999, tone };
      s[`TK-${id}`]   = s[`tank:${id}`]; // compat
    }

    // Bombas
    for (const p of plant.pumps || []) {
      const id = (p as any).id ?? (p as any).pump_id;
      if (id == null) continue;

      const rawAge =
        Number.isFinite((p as any).ageSec) ? (p as any).ageSec :
        Number.isFinite((p as any).age_sec) ? (p as any).age_sec :
        null;
      const age = rawAge !== null ? Number(rawAge) : null;
      const online = typeof (p as any).online === "boolean" ? (p as any).online : (age !== null ? age <= ONLINE_DEAD_SEC : false);
      const tone: "ok" | "warn" | "bad" = online ? "ok" : (age !== null && age <= ONLINE_WARN_SEC ? "warn" : "bad");

      s[`pump:${id}`] = { online, ageSec: age ?? 999999, tone };
      s[`PU-${id}`]   = s[`pump:${id}`]; // compat
    }

    return s;
  }, [plant.tanks, plant.pumps]);

  const operacionesBody = (
    <OverviewGrid
      plant={plant}
      onOpenTank={(id) => setDrawer({ type: "tank", id })}
      onOpenPump={(id) => setDrawer({ type: "pump", id })}
      statusByKey={statusByKey}
      debug
    />
  );

  // === Contenido central según vista ===
  const mainBody = (() => {
    if (view === "operaciones") {
      return (
        <div className="max-w-7xl mx-auto p-4 md:p-6">
          {loading && !plant.tanks.length ? <div className="p-4">Cargando…</div>
            : err ? <div className="p-4 text-red-600">Error: {String(err)}</div>
            : operacionesBody}
        </div>
      );
    }
    if (view === "kpi") {
      return <EmbeddedAppFrame src={app1Src} title="KPIs" />;
    }
    // view === "infra"
    return <EmbeddedAppFrame src={app2Src} title="Infraestructura" />;
  })();

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <div className="flex">
        {/* === SIDEBAR === */}
        <aside className="hidden md:flex md:flex-col md:w-64 bg-white border-r border-slate-200 min-h-screen p-4 overflow-y-auto">
          <div>
            <div className="flex items-center gap-2 mb-6">
              <img src="/img/logodirac.jpeg" alt="Logo DIRAC" className="h-8 w-8 rounded-lg object-cover" />
              <div>
                <div className="text-sm text-slate-500">INSTRUMENTACION</div>
                <div className="font-semibold">DIRAC</div>
              </div>
            </div>

            <nav className="space-y-1 mb-6">
              <NavItem label="Operaciones" active={view === "operaciones"} onClick={() => setView("operaciones")} />
              <NavItem label="KPIs" active={view === "kpi"} onClick={() => setView("kpi")} />
              <NavItem label="Infraestructura" active={view === "infra"} onClick={() => setView("infra")} />
            </nav>
          </div>

          <div className="text-xs text-slate-500 mt-auto border-t pt-3">
            <div>Usuario: {user.name}</div>
            <div>Rol: {user.role}</div>
            <div>Empresa: {user.company?.name ?? "—"}</div>
          </div>
        </aside>

        {/* === CONTENIDO PRINCIPAL === */}
        <main className="flex-1 min-h-screen">
          <header className="sticky top-0 z-10 bg-white border-b border-slate-200">
            <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="text-lg font-semibold tracking-tight">
                  {view === "operaciones" ? "Operaciones" : view === "kpi" ? "KPIs" : "Infraestructura"}
                </div>
                {view === "operaciones" && (
                  <div className="hidden md:flex items-center gap-3 text-xs">
                    <KpiPill label="Nivel promedio" value={loading && !plant.tanks.length ? "…" : `${kpis.avg}%`} tone="ok" />
                    <KpiPill label="Críticos" value={loading && !plant.tanks.length ? "…" : `${kpis.crit}`} tone={kpis.crit ? "bad" : "ok"} />
                  </div>
                )}
              </div>
              <div className="flex items-center gap-3">
                <span className="px-2 py-1 rounded-lg bg-slate-100 text-xs">{user.company?.name ?? "—"}</span>
                <LogoutButton />
              </div>
            </div>
          </header>

          {mainBody}
        </main>
      </div>

      {/* === DRAWER === */}
      {(() => {
        const isTank = drawer.type === "tank";
        const t = isTank ? plant.tanks.find((x: any) => String((x as any).id ?? (x as any).tank_id) === String(drawer.id)) : null;
        const p = drawer.type === "pump" ? plant.pumps.find((x: any) => String((x as any).id ?? (x as any).pump_id) === String(drawer.id)) : null;

        const sev = t ? severityOf((t as any).levelPct, (t as any).thresholds ?? DEFAULT_THRESHOLDS) : null;
        const meta = sev ? sevMeta(sev) : null;

        return (
          <Drawer
            open={!!drawer.type}
            onClose={() => setDrawer({ type: null })}
            title={isTank ? (t as any)?.name : drawer.type === "pump" ? (p as any)?.name : "Faceplate"}
            right={isTank && meta ? <Badge tone={meta.tone}>{meta.label}</Badge> : null}
          >
            {isTank && t && <TankFaceplate tank={t} headerless />}
            {drawer.type === "pump" && p && <PumpFaceplate pump={p} />}
          </Drawer>
        );
      })()}
    </div>
  );
}
