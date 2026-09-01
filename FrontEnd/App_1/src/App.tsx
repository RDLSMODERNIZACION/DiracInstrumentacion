import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Operations from "@/pages/Operations";
import PumpAnalysis from "@/pages/PumpAnalysis";

const basename = import.meta.env.BASE_URL || "/";

export default function App() {
  return (
    <BrowserRouter basename={basename}>
      <Routes>
        <Route path="/" element={<Navigate to="/operations" replace />} />
        <Route path="/operations" element={<Operations />} />
        <Route path="/pump/:pumpId" element={<PumpAnalysis />} />
      </Routes>
    </BrowserRouter>
  );
}
