import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Operations from "@/pages/Operations";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/operations" replace />} />
        <Route path="/operations" element={<Operations />} />
      </Routes>
    </BrowserRouter>
  );
}
