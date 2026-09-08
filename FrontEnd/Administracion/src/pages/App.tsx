import React from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import AdminLayout from "../layouts/AdminLayout";
import Users from "./Users";
import Locations from "./Locations";
import Tanks from "./Tanks";
import Pumps from "./Pumps";
import Valves from "./Valves";
import Manifolds from "./Manifolds";
import Activity from "./Activity";
import { useAuth } from "../lib/auth";

function MissingMainSession() {
  React.useEffect(() => {
    const id = window.setTimeout(() => {
      window.location.replace("/");
    }, 900);
    return () => window.clearTimeout(id);
  }, []);

  return (
    <div className="min-h-screen grid place-items-center bg-slate-50 p-4">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <div className="text-lg font-semibold text-slate-900">Sesión principal no disponible</div>
        <p className="mt-2 text-sm text-slate-500">
          Administración usa la misma sesión del panel principal. Volviendo al panel…
        </p>
        <button
          onClick={() => window.location.replace("/")}
          className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
        >
          Volver ahora
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center bg-slate-50 text-slate-500">
        Validando sesión principal…
      </div>
    );
  }

  // No existe un segundo login para Administración.
  // Si no está la sesión compartida del panel principal, volvemos al panel.
  if (!isAuthenticated) return <MissingMainSession />;

  return (
    <Routes>
      <Route element={<AdminLayout />}>
        <Route index element={<Navigate to="/users" replace />} />
        <Route path="users" element={<Users />} />
        <Route path="activity" element={<Activity />} />
        <Route path="locations" element={<Locations />} />
        <Route path="tanks" element={<Tanks />} />
        <Route path="pumps" element={<Pumps />} />
        <Route path="valves" element={<Valves />} />
        <Route path="manifolds" element={<Manifolds />} />
        <Route path="companies/*" element={<Navigate to="/users" replace />} />
        <Route path="*" element={<Navigate to="/users" replace />} />
      </Route>
    </Routes>
  );
}
