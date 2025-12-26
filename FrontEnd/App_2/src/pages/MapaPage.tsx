import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";

// 👉 IMPORT DIRECTO AL MAPA REAL
import MapaApp from "../features/mapa/src/MapaApp";

// 👉 IMPORT DIRECTO AL CSS REAL
import "../features/mapa/src/styles.css";

export default function MapaPage() {
  const navigate = useNavigate();

  // opcional: arregla íconos leaflet (si tu MapaApp no lo hace ya)
  useEffect(() => {}, []);

  return (
    <div style={{ width: "100vw", height: "100vh" }}>
      <div style={{ padding: 8, display: "flex", gap: 8, alignItems: "center" }}>
        <button
          onClick={() => navigate("/")}
          style={{
            padding: "4px 8px",
            borderRadius: 8,
            border: "1px solid #cbd5e1",
            background: "#fff",
          }}
        >
          ← Volver
        </button>
      </div>

      <div style={{ width: "100%", height: "calc(100vh - 48px)" }}>
        <MapaApp />
      </div>
    </div>
  );
}
