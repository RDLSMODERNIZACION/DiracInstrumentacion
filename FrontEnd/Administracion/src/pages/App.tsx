import React from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import AdminLayout from "../layouts/AdminLayout";
import Dashboard from "./Dashboard";
import Users from "./Users";
import Locations from "./Locations";
import Tanks from "./Tanks";
import Pumps from "./Pumps";
import Valves from "./Valves";
import Manifolds from "./Manifolds";
import Activity from "./Activity";
import Login from "./Login";
import { useAuth } from "../lib/auth";

export default function App() {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center bg-slate-50 text-slate-500">
        Validando sesión…
      </div>
    );
  }

  if (!isAuthenticated) return <Login />;

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
