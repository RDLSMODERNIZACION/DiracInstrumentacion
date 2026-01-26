// src/components/scada/AppRoot.tsx
import React, { useEffect, useState } from "react";
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
  if (locs.some((l) => l.access === "admin")) return "admin";
  if (locs.some((l) => l.access === "control")) return "operator";
  return "viewer";
}

const COMPANY_KEY = "dirac.company_id";

export default function AppRoot() {
  const { isAuthenticated, email, logout } = useAuth();
  const api = useAuthedFetch();

  const [user, setUser] = useState<User | null>(null);
  const [loadingUser, setLoadingUser] = useState(false);

  const [companyId, setCompanyId] = useState<number | null>(null);
  const [allowedLocationIds, setAllowedLocationIds] = useState<Set<number>>(new Set());

  const loc = useLocation();
  useEffect(() => {
    console.log("[AppRoot] route →", loc.pathname);
  }, [loc.pathname]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!isAuthenticated) {
        setUser(null);
        setCompanyId(null);
        setAllowedLocationIds(new Set());
        return;
      }

      setLoadingUser(true);
      try {
        const res = await api("/dirac/me/locations");
        if (!res.ok) throw new Error(`me/locations -> ${res.status}`);
        const locs: MeLocation[] = await res.json();

        const availableCompanyIds = Array.from(
          new Set(
            locs
              .map((l) => (l.company_id == null ? null : Number(l.company_id)))
              .filter((x): x is number => x !== null)
          )
        );

        const persisted = sessionStorage.getItem(COMPANY_KEY);
        let chosenCompanyId: number | null = null;
        if (persisted && availableCompanyIds.includes(Number(persisted))) {
          chosenCompanyId = Number(persisted);
        } else if (availableCompanyIds.length) {
          chosenCompanyId = availableCompanyIds[0];
        }

        const visibleLocs =
          chosenCompanyId === null
            ? locs
            : locs.filter((l) => Number(l.company_id) === chosenCompanyId);

        const role = deriveRoleFromAccess(visibleLocs);
        const allowed = new Set<number>(visibleLocs.map((l) => Number(l.location_id)));

        // ✅ Tu backend NO tiene /dirac/me (404). No lo llamamos.
        // Intentamos resolver nombre empresa vía /dirac/admin/companies si existe.
        let companyName: string | undefined = undefined;

        if (chosenCompanyId !== null) {
          try {
            const list = await api("/dirac/admin/companies");
            if (list.ok) {
              const rows: any[] = await list.json();
              const found = rows.find((r) => Number(r.id) === Number(chosenCompanyId));
              companyName = found?.name;
            }
          } catch {
            // ignorar
          }
          if (!companyName) companyName = `Empresa #${chosenCompanyId}`;
        }

        const u: User = {
          id: "me",
          name: email || "usuario",
          role,
          // @ts-expect-error: shape exacto puede variar en tu proyecto
          company:
            chosenCompanyId !== null
              ? { id: String(chosenCompanyId), name: companyName }
              : undefined,
        } as unknown as User;

        if (!cancelled) {
          setUser(u);
          setCompanyId(chosenCompanyId);
          setAllowedLocationIds(allowed);

          if (chosenCompanyId !== null) sessionStorage.setItem(COMPANY_KEY, String(chosenCompanyId));
          else sessionStorage.removeItem(COMPANY_KEY);
        }
      } catch (err) {
        console.error("Auth inválida:", err);
        logout();
        if (!cancelled) {
          setUser(null);
          setCompanyId(null);
          setAllowedLocationIds(new Set());
        }
      } finally {
        if (!cancelled) setLoadingUser(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, email, api, logout]);

  if (!isAuthenticated) {
    return <Login onSuccess={() => {}} />;
  }

  if (loadingUser || !user) {
    return (
      <div className="min-h-screen grid place-items-center text-slate-600">
        Cargando…
      </div>
    );
  }

  return (
    <Routes>
      <Route
        path="/*"
        element={
          <ScadaApp
            initialUser={user}
            allowedLocationIds={allowedLocationIds}
            selectedCompanyId={companyId}
          />
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
