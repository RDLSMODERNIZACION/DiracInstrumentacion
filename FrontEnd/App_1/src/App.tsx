import React from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import Operations from "@/pages/Operations";
import PumpAnalysis from "@/pages/PumpAnalysis";

const basename = import.meta.env.BASE_URL || "/";

export function OperationsRedirect() {
  const { search, hash } = useLocation();
  return <Navigate to={{ pathname: "/operations", search, hash }} replace />;
}

export default function App() {
  return (
    <BrowserRouter basename={basename}>
      <Routes>
        <Route path="/" element={<OperationsRedirect />} />
        <Route path="/operations" element={<Operations />} />
        <Route path="/pump/:pumpId" element={<PumpAnalysis />} />
      </Routes>
    </BrowserRouter>
  );
}
