// src/App.tsx
import { Routes, Route } from "react-router-dom";
import InfraDiagram from "@/features/infra-diagram/InfraDiagram";
import MapaPage from "@/pages/MapaPage";
import { installNetDebug } from "@/lib/netdebug";

installNetDebug(); // activa logs si ?debug=net o ?debug=1

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<InfraDiagram />} />
      <Route path="mapa" element={<MapaPage />} />
      <Route path="*" element={<InfraDiagram />} />
    </Routes>
  );
}
