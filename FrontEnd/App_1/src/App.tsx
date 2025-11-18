import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Operations from "@/pages/Operations";

// El basename se ajusta solo según el base definido en vite.config.ts
// En dev: "/"   |   En prod: "/kpi/"
const basename = import.meta.env.BASE_URL || "/";

export default function App() {
  return (
    <BrowserRouter basename={basename}>
      <Routes>
        {/* "/" relativo al basename → en prod significa "/kpi/" */}
        <Route path="/" element={<Navigate to="/operations" replace />} />

        {/* "/operations" relativo al basename → "/kpi/operations" en prod */}
        <Route path="/operations" element={<Operations />} />
      </Routes>
    </BrowserRouter>
  );
}
