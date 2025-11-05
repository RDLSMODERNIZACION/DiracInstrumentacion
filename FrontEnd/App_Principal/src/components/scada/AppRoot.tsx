// src/components/scada/AppRoot.tsx
import React, { useEffect, useMemo, useState } from "react";
import type { User } from "./types";
import ScadaApp from "./ScadaApp";
import { Routes, Route, useLocation, Navigate } from "react-router-dom";
import Login from "../auth/Login";
import { useAuth, useAuthedFetch } from "../../lib/auth";

type MeLocation = {
  location_id: number;
  location_name: string;
  access: "view" | "control" | "admin";
  company_id?: number | null;
};

function deriveRoleFromAccess(locs: MeLocation[]): User["role"] {
  if (locs.some(l => l.access === "admin")) return "admin" as User["role"];
  if (locs.some(l => l.access === "control")) return "operator" as User["role"];
  return "viewer" as User["role"];
}

export default function AppRoot() {
  const { isAuthenticated, email } = useAuth();
  const api = useAuthedFetch();

  const [user, setUser] = useState<User | null>(null);
  const [loadingUser, setLoadingUser] = useState(false);

  const loc = useLocation();
  useEffect(() => {
    console.log("[AppRoot] route change →", loc.pathname);
  }, [loc.pathname]);

  // Cargar “mi perfil efectivo” después del login (derivado de /dirac/me/locations)
  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!isAuthenticated) {
        setUser(null);
        return;
      }
      setLoadingUser(true);
      try {
        const res = await api("/dirac/me/locations");
        if (!res.ok) throw new Error(`me/locations -> ${res.status}`);
        const locs: MeLocation[] = await res.json();

        const role = deriveRoleFromAccess(locs);
        const firstCompanyId = locs[0]?.company_id ?? null;

        // Armamos un User mínimo para inicializar ScadaApp.
        // Ajustá las props si tu User requiere otras claves.
        const u: User = {
          id: "me",
          name: email || "usuario",
          role,
          // @ts-expect-error: company shape puede variar en tu proyecto
          company: firstCompanyId
            ? { id: String(firstCompanyId), name: `Empresa #${firstCompanyId}` }
            : undefined,
        } as unknown as User;

        if (!cancelled) setUser(u);
      } catch (err) {
        console.error("Error cargando /dirac/me/locations:", err);
        // Fallback: al menos dejarte entrar con rol viewer
        const u: User = {
          id: "me",
          name: email || "usuario",
          role: "viewer" as User["role"],
        } as unknown as User;
        if (!cancelled) setUser(u);
      } finally {
        if (!cancelled) setLoadingUser(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, email, api]);

  // Si no hay sesión (HTTP Basic), mostramos Login
  if (!isAuthenticated) {
    return <Login onSuccess={() => { /* el AuthProvider y este efecto cargarán el user */ }} />;
  }

  // Loader sencillo mientras construimos el objeto User
  if (loadingUser || !user) {
    return (
      <div className="min-h-screen grid place-items-center text-slate-600">
        Cargando…
      </div>
    );
  }

  // App principal
  return (
    <Routes>
      <Route path="/*" element={<ScadaApp initialUser={user} />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
