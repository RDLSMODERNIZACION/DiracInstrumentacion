import { Routes, Route } from "react-router-dom";
import InfraDiagram from "@/features/infra-diagram/InfraDiagram";
import MapaPage from "@/pages/MapaPage";
import { installNetDebug } from "@/lib/netdebug";

installNetDebug();

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<InfraDiagram />} />
      <Route path="/mapa" element={<MapaPage />} />

      {/* ✅ fallback: si cae en cualquier cosa, mostramos InfraDiagram sin tocar la URL */}
      <Route path="*" element={<InfraDiagram />} />
    </Routes>
  );
}
