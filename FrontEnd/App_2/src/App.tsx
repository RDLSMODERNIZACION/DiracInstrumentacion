// src/App.tsx
import { Routes, Route, Navigate } from "react-router-dom";
import InfraDiagram from "@/features/infra-diagram/InfraDiagram";
import MapaPage from "@/pages/MapaPage";
import { installNetDebug } from "@/lib/netdebug";

installNetDebug(); // activa logs si ?debug=net o ?debug=1

export default function App() {
  return (
    <Routes>
      {/* App principal */}
      <Route path="/" element={<InfraDiagram />} />

      {/* Página MAPA (link real, no embebido) */}
      <Route path="/mapa" element={<MapaPage />} />

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
