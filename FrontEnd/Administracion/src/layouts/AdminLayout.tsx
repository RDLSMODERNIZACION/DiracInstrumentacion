// src/layouts/AdminLayout.tsx
import React from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../lib/auth";

const navItem = () =>
  ({ isActive }: { isActive: boolean }) =>
    `block px-2 py-1 rounded ${isActive ? "bg-slate-200" : "hover:bg-slate-100"}`;

export default function AdminLayout() {
  const { logout, email, companyName } = useAuth();

  return (
    <div className="min-h-screen flex">
      <aside className="w-64 bg-white border-r p-4 flex flex-col">
        <Link to="/" className="block font-bold mb-1">
          DIRAC Admin
        </Link>
        <div className="mb-4 text-xs font-semibold text-slate-500">
          {companyName ?? "Empresa"}
        </div>

        <nav className="space-y-1 text-sm">
          <NavLink to="/users" className={navItem()}>
            Usuarios
          </NavLink>
          <NavLink to="/activity" className={navItem()}>
            Actividad de usuarios
          </NavLink>
          <NavLink to="/locations" className={navItem()}>
            Localizaciones
          </NavLink>
          <NavLink to="/tanks" className={navItem()}>
            Tanques
          </NavLink>
          <NavLink to="/pumps" className={navItem()}>
            Bombas
          </NavLink>
          <NavLink to="/valves" className={navItem()}>
            Válvulas
          </NavLink>
          <NavLink to="/manifolds" className={navItem()}>
            Manifolds
          </NavLink>
        </nav>

        <div className="mt-auto pt-4 text-xs text-slate-500 border-t">
          <div className="font-semibold text-slate-700">{companyName}</div>
          <div className="mt-1">{email}</div>
          <button onClick={logout} className="mt-2 underline">
            Salir
          </button>
        </div>
      </aside>

      <main className="flex-1 p-6 min-w-0">
        <Outlet />
      </main>
    </div>
  );
}
