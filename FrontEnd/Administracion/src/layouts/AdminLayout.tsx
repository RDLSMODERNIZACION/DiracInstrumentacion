import React from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../lib/auth";

export default function AdminLayout() {
  const { logout, email } = useAuth();
  return (
    <div className="min-h-screen flex">
      <aside className="w-64 bg-white border-r p-4">
        <Link to="/" className="block font-bold mb-4">DIRAC Admin</Link>
        <nav className="space-y-1 text-sm">
          <NavLink to="/companies" className={({isActive})=>`block px-2 py-1 rounded ${isActive?"bg-slate-200":"hover:bg-slate-100"}`}>Empresas</NavLink>
          <NavLink to="/users" className={({isActive})=>`block px-2 py-1 rounded ${isActive?"bg-slate-200":"hover:bg-slate-100"}`}>Usuarios</NavLink>
          <NavLink to="/locations" className={({isActive})=>`block px-2 py-1 rounded ${isActive?"bg-slate-200":"hover:bg-slate-100"}`}>Localizaciones</NavLink>
          <NavLink to="/tanks" className={({isActive})=>`block px-2 py-1 rounded ${isActive?"bg-slate-200":"hover:bg-slate-100"}`}>Tanques</NavLink>
          <NavLink to="/pumps" className={({isActive})=>`block px-2 py-1 rounded ${isActive?"bg-slate-200":"hover:bg-slate-100"}`}>Bombas</NavLink>
          <NavLink to="/valves" className={({isActive})=>`block px-2 py-1 rounded ${isActive?"bg-slate-200":"hover:bg-slate-100"}`}>Válvulas</NavLink>
        </nav>
        <div className="mt-auto pt-4 text-xs text-slate-500">
          <div>{email}</div>
          <button onClick={logout} className="underline">Salir</button>
        </div>
      </aside>
      <main className="flex-1 p-6">
        <Outlet />
      </main>
    </div>
  );
}
