// src/components/scada/ScadaApp.tsx
import React from "react";
import type { User } from "./types";
import { Drawer, NavItem, Badge } from "./ui";
import { OverviewGrid } from "./pages";
import { sevMeta, severityOf } from "./utils";
import { usePlant } from "./hooks/usePlant";
import { TankFaceplate } from "./faceplates/TankFaceplate";
import { PumpFaceplate } from "./faceplates/PumpFaceplate";
import EmbeddedAppFrame from "./scada/EmbeddedSidebar";
import LogoutButton from "../auth/LogoutButton";

const DEFAULT_THRESHOLDS = { lowCritical: 10, lowWarning: 25, highWarning: 80, highCritical: 90 };

// === umbrales de conectividad (coincidir con backend) ===
const ONLINE_DEAD_SEC = 60; // <= 60s = online
const ONLINE_WARN_SEC = 120; // >60 y <=120 = warn

type View = "operaciones" | "kpi" | "infra" | "admin";

/* 🔁 KPI (App 1): ahora lo armamos con company_id cuando esté seleccionado */
const app1Base = import.meta.env.DEV
  ? import.meta.env.VITE_APP1_DEV ?? "http://localhost:5174/"
  : "/kpi/";

// Base de Infra (el company_id se agrega dentro del componente)
const app2Base = import.meta.env.DEV
  ? import.meta.env.VITE_APP2_DEV ?? "http://localhost:5175/"
  : "/infraestructura/";

// App de Administración independiente (igual que KPI/Infra)
const app3Src = import.meta.env.DEV
  ? (import.meta.env.VITE_ADMIN_DEV ?? import.meta.env.VITE_APP3_DEV ?? "http://localhost:5178/")
  : "/admin/";

type Props = {
  initialUser?: User;
  /** Conjunto de location_id que el usuario puede ver (filtrado por empresa) */
  allowedLocationIds?: Set<number>;
  /** Empresa seleccionada (opcional, sólo para mostrar y para pasar al iframe de infra/KPI) */
  selectedCompanyId?: number | null;
};

export default function ScadaApp({ initialUser, allowedLocationIds, selectedCompanyId }: Props) {
  const [drawer, setDrawer] = React.useState<{ type: "tank" | "pump" | null; id?: string | number | null }>({
    type: null,
  });

  // Usuario derivado de /dirac/me/locations
  const [user] = React.useState<User>(
    initialUser ||
      ({
        id: "me",
        name: "usuario",
        role: "viewer",
      } as unknown as User)
  );

  // ✅ sólo owner/admin/operator pueden operar bombas (UI)
  const canControlPumps = React.useMemo(
    () => ["owner", "admin", "operator"].includes((user?.role as any) ?? ""),
    [user?.role]
  );

  // ✅ sólo owner/admin pueden acceder a KPI/Infra
  const canSeeAdvanced = React.useMemo(
    () => ["owner", "admin"].includes((user?.role as any) ?? ""),
    [user?.role]
  );

  // ✅ sólo owner pueden acceder a Administración
  const canSeeAdmin = React.useMemo(() => (user?.role as any) === "owner", [user?.role]);

  const [view, setView] = React.useState<View>("operaciones");
  const [adminUsername, setAdminUsername] = React.useState("");
  const [adminPassword, setAdminPassword] = React.useState("");
  const [adminError, setAdminError] = React.useState("");

  const submitAdminLogin = React.useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      setAdminError("");

      if (
        adminUsername.trim().toLowerCase() !== "admin" ||
        adminPassword !== "admin"
      ) {
        setAdminError("Usuario o contraseÃ±a incorrectos");
        return;
      }

      try {
        // Handoff de una sola vez para que /admin/ entre sin pedir login otra vez.
        sessionStorage.setItem("dirac.admin.handoff", "1");
      } catch {}

      window.location.assign(app3Src);
    },
    [adminUsername, adminPassword]
  ); // vista actual
// 🔁 Pausar polling cuando hay faceplate abierto o no estamos en "operaciones"
  const pollMs = drawer.type || view !== "operaciones" ? 0 : 1000;

  // Pasamos allowedLocationIds para que el hook filtre lo que trae del backend
  const { plant, loading, err, kpis } = usePlant(pollMs, allowedLocationIds);

  // === statusByKey para tanques y bombas ===
  const statusByKey = React.useMemo(() => {
    const s: Record<string, { online: boolean; ageSec: number; tone: "ok" | "warn" | "bad" }> = {};

    // Tanques
    for (const t of plant.tanks || []) {
      const id = (t as any).id ?? (t as any).tank_id;
      if (id == null) continue;

      const rawAge = Number.isFinite((t as any).ageSec)
        ? (t as any).ageSec
        : Number.isFinite((t as any).age_sec)
        ? (t as any).age_sec
        : null;

      const age = rawAge !== null ? Number(rawAge) : null;
      const online =
        typeof (t as any).online === "boolean" ? (t as any).online : age !== null ? age <= ONLINE_DEAD_SEC : false;
      const tone: "ok" | "warn" | "bad" = online ? "ok" : age !== null && age <= ONLINE_WARN_SEC ? "warn" : "bad";

      s[`tank:${id}`] = { online, ageSec: age ?? 999999, tone };
      s[`TK-${id}`] = s[`tank:${id}`]; // compat
    }

    // Bombas
    for (const p of plant.pumps || []) {
      const id = (p as any).id ?? (p as any).pump_id;
      if (id == null) continue;

      const rawAge = Number.isFinite((p as any).ageSec)
        ? (p as any).ageSec
        : Number.isFinite((p as any).age_sec)
        ? (p as any).age_sec
        : null;

      const age = rawAge !== null ? Number(rawAge) : null;
      const online =
        typeof (p as any).online === "boolean" ? (p as any).online : age !== null ? age <= ONLINE_DEAD_SEC : false;
      const tone: "ok" | "warn" | "bad" = online ? "ok" : age !== null && age <= ONLINE_WARN_SEC ? "warn" : "bad";

      s[`pump:${id}`] = { online, ageSec: age ?? 999999, tone };
      s[`PU-${id}`] = s[`pump:${id}`]; // compat
    }

    return s;
  }, [plant.tanks, plant.pumps]);

  // === assetLocs para OverviewGrid (evita warning "linkMap vacío")
  const assetLocs = React.useMemo(() => {
    const rows: Array<{
      asset_type: "tank" | "pump";
      asset_id: number;
      location_id?: number | null;
      code?: string | null;
      name?: string | null;
      location?: { id?: number | null; code?: string | null; name?: string | null } | null;
    }> = [];

    for (const t of plant.tanks ?? []) {
      const id = Number((t as any).id ?? (t as any).tank_id);
      if (!Number.isFinite(id)) continue;
      const locId = (t as any).location_id ?? (t as any).location?.id ?? null;
      const locName = (t as any).location_name ?? (t as any).location?.name ?? null;
      rows.push({
        asset_type: "tank",
        asset_id: id,
        location_id: locId,
        location: { id: locId, name: locName },
      });
    }

    for (const p of plant.pumps ?? []) {
      const id = Number((p as any).id ?? (p as any).pump_id);
      if (!Number.isFinite(id)) continue;
      const locId = (p as any).location_id ?? (p as any).location?.id ?? null;
      const locName = (p as any).location_name ?? (p as any).location?.name ?? null;
      rows.push({
        asset_type: "pump",
        asset_id: id,
        location_id: locId,
        location: { id: locId, name: locName },
      });
    }

    return rows;
  }, [plant.tanks, plant.pumps]);

  const operacionesBody = (
    <OverviewGrid
      plant={plant}
      onOpenTank={(id) => setDrawer({ type: "tank", id })}
      onOpenPump={(id) => setDrawer({ type: "pump", id })}
      statusByKey={statusByKey}
      assetLocs={assetLocs}
      /* debug */ // quitado para silenciar warnings/console
    />
  );

  const noPermsBanner = (
    <div className="max-w-7xl mx-auto p-4 md:p-6">
      <div className="rounded-lg border border-amber-300 bg-amber-50 text-amber-800 px-4 py-3 text-sm">
        No tenés permisos suficientes para acceder a esta sección.
      </div>
    </div>
  );

  const ownerOnlyBanner = (
    <div className="max-w-7xl mx-auto p-4 md:p-6">
      <div className="rounded-lg border border-rose-300 bg-rose-50 text-rose-800 px-4 py-3 text-sm">
        No tenés permisos suficientes para acceder a <b>Administración</b>. 
      </div>
    </div>
  );

  // 👉 KPI con scope de empresa: si hay selectedCompanyId, agregamos ?company_id=ID
  const app1Src = React.useMemo(() => {
    const base = app1Base;
    if (selectedCompanyId == null) return base;
    const sep = base.includes("?") ? "&" : "?";
    return `${base}${sep}company_id=${selectedCompanyId}`;
  }, [selectedCompanyId]);

  // 👉 Infra con scope de empresa: si hay selectedCompanyId, agregamos ?company_id=ID
  const app2Src = React.useMemo(() => {
    if (selectedCompanyId == null) return app2Base;
    const sep = app2Base.includes("?") ? "&" : "?";
    return `${app2Base}${sep}company_id=${selectedCompanyId}`;
  }, [selectedCompanyId]);

  // Persistimos el company_id para apps embebidas que leen de storage (fallback)
  React.useEffect(() => {
    if (selectedCompanyId != null) {
      try {
        sessionStorage.setItem("dirac.company_id", String(selectedCompanyId));
      } catch {}
    }
  }, [selectedCompanyId]);

  // === Contenido central según vista (con gating de permisos) ===
  const mainBody = (() => {
    if (view === "operaciones") {
      return (
        <div className="w-full max-w-md mx-auto px-2.5 py-3 sm:max-w-7xl sm:p-4 md:p-6">
          {loading && !plant.tanks.length ? (
            <div className="p-4">Cargando…</div>
          ) : err ? (
            <div className="p-4 text-red-600">Error: {String(err)}</div>
          ) : (
            operacionesBody
          )}
        </div>
      );
    }
    if (view === "kpi") {
      if (!canSeeAdvanced) return noPermsBanner;
      return <EmbeddedAppFrame key={app1Src} src={app1Src} title="KPIs" />;
    }
    if (view === "infra") {
      if (!canSeeAdvanced) return noPermsBanner;
      return <EmbeddedAppFrame key={app2Src} src={app2Src} title="Infraestructura" />;
    }

    return (
      <div className="min-h-[calc(100vh-58px)] bg-slate-50 px-4 py-10">
        <div className="mx-auto w-full max-w-sm">
          <form
            onSubmit={submitAdminLogin}
            className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
          >
            <div className="mb-5">
              <div className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">
                Acceso restringido
              </div>
              <h2 className="mt-1 text-xl font-bold text-slate-900">
                AdministraciÃ³n
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                IngresÃ¡ las credenciales administrativas para continuar.
              </p>
            </div>

            <label className="mb-1 block text-sm font-semibold text-slate-700">
              Usuario
            </label>
            <input
              value={adminUsername}
              onChange={(e) => setAdminUsername(e.target.value)}
              autoComplete="username"
              className="mb-4 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-slate-500"
              placeholder="Usuario"
            />

            <label className="mb-1 block text-sm font-semibold text-slate-700">
              ContraseÃ±a
            </label>
            <input
              type="password"
              value={adminPassword}
              onChange={(e) => setAdminPassword(e.target.value)}
              autoComplete="current-password"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-slate-500"
              placeholder="ContraseÃ±a"
            />

            {adminError ? (
              <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {adminError}
              </div>
            ) : null}

            <button
              type="submit"
              className="mt-5 w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-slate-800"
            >
              Entrar a AdministraciÃ³n
            </button>
          </form>
        </div>
      </div>
    );
  })();

  const companyBadge = user.company?.name ?? (selectedCompanyId != null ? `Empresa #${selectedCompanyId}` : "—");

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
              <NavItem label="Administración" active={view === "admin"} onClick={() => setView("admin")} />
            </nav>
          </div>

          <div className="text-xs text-slate-500 mt-auto border-t pt-3">
            <div>Usuario: {user.name}</div>
            <div>Rol: {user.role}</div>
            <div>Empresa: {companyBadge}</div>
          </div>
        </aside>

        {/* === CONTENIDO PRINCIPAL === */}
        <main className="flex-1 min-h-screen">
          <header className="sticky top-0 z-10 bg-white border-b border-slate-200">
            <div className="w-full max-w-md mx-auto px-3 py-2.5 flex items-center justify-between sm:max-w-7xl sm:px-4 sm:py-3">
              <div className="flex items-center gap-3">
                <div className="text-base sm:text-lg font-semibold tracking-tight">
                  {view === "operaciones"
                    ? "Operaciones"
                    : view === "kpi"
                    ? "KPIs"
                    : view === "infra"
                    ? "Infraestructura"
                    : "Administración"}
                </div>

                {/* ✅ Eliminado: KpiPill de "Nivel promedio" y "Críticos" */}
              </div>

              <div className="flex items-center gap-3">
                <span className="px-2 py-1 rounded-lg bg-slate-100 text-xs">{companyBadge}</span>
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
        const t = isTank
          ? plant.tanks.find((x: any) => String((x as any).id ?? (x as any).tank_id) === String(drawer.id))
          : null;
        const p =
          drawer.type === "pump"
            ? plant.pumps.find((x: any) => String((x as any).id ?? (x as any).pump_id) === String(drawer.id))
            : null;

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
            {drawer.type === "pump" && p && (
              <PumpFaceplate
                pump={p}
                canControl={canControlPumps}
              />
            )}
          </Drawer>
        );
      })()}
    </div>
  );
}
