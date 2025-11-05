import React from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "../lib/auth";
import Login from "./Login";
import AdminLayout from "../layouts/AdminLayout";
import Dashboard from "./Dashboard";
import Companies from "./Companies";
import CompanyUsers from "./CompanyUsers";
import Users from "./Users";
import Locations from "./Locations";
import Tanks from "./Tanks";
import Pumps from "./Pumps";
import Valves from "./Valves";

export default function App() {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Login />;

  return (
    <Routes>
      <Route element={<AdminLayout />}>
        <Route index element={<Dashboard />} />
        <Route path="companies" element={<Companies />} />
        <Route path="companies/:id/users" element={<CompanyUsers />} />
        <Route path="users" element={<Users />} />
        <Route path="locations" element={<Locations />} />
        <Route path="tanks" element={<Tanks />} />
        <Route path="pumps" element={<Pumps />} />
        <Route path="valves" element={<Valves />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
