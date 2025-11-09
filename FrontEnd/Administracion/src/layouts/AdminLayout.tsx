// src/layouts/AdminLayout.tsx
import React from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../lib/auth";

const navItem = (to: string, label: string) =>
  ({ isActive }: { isActive: boolean }) =>
    `block px-2 py-1 rounded ${isActive ? "bg-slate-200" : "hover:bg-slate-100"}`;

export default function AdminLayout() {
  const { logout, email } = useAuth();

  return (
    <div className="min-h-screen flex">
      <aside className="w-64 bg-white border-r p-4 flex flex-col">
        <Link to="/" className="block font-bold mb-4">
          DIRAC Admin
        </Link>

        <nav className="space-y-1 text-sm">
          <NavLink to="/companies" className={navItem("/companies", "Empresas")}>
            Empresas
          </NavLink>
          <NavLink to="/users" className={navItem("/users", "Usuarios")}>
            Usuarios
          </NavLink>
          <NavLink to="/locations" className={navItem("/locations", "Localizaciones")}>
            Localizaciones
          </NavLink>
          <NavLink to="/tanks" className={navItem("/tanks", "Tanques")}>
            Tanques
          </NavLink>
          <NavLink to="/pumps" className={navItem("/pumps", "Bombas")}>
            Bombas
          </NavLink>
          <NavLink to="/valves" className={navItem("/valves", "Válvulas")}>
            Válvulas
          </NavLink>
          {/* 👇 Nuevo item */}
          <NavLink to="/manifolds" className={navItem("/manifolds", "Manifolds")}>
            Manifolds
          </NavLink>
        </nav>

        <div className="mt-auto pt-4 text-xs text-slate-500">
          <div>{email}</div>
          <button onClick={logout} className="underline">
            Salir
          </button>
        </div>
      </aside>

      <main className="flex-1 p-6">
        <Outlet />
      </main>
    </div>
  );
}
