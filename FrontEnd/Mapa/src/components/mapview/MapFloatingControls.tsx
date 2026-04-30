import type { CSSProperties } from "react";
import type { SimMode } from "./mapTypes";

function mainButtonStyle(active: boolean, activeBg: string, opacity = 1): CSSProperties {
  return {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.2)",
    background: active ? activeBg : "rgba(15,23,42,0.78)",
    color: "#fff",
    fontWeight: 800,
    cursor: "pointer",
    boxShadow: "0 12px 25px rgba(0,0,0,0.22)",
    opacity,
  };
}

export default function MapFloatingControls({
  creatingPipe,
  onToggleCreatingPipe,
  nodeConnectOpen,
  onOpenNodeConnector,
  showContours,
  setShowContours,
  showPressureNodes,
  setShowPressureNodes,
  simMode,
  onToggleSimMode,
  simActive,
  simBusy,
  onToggleSim,
  showLegend,
  setShowLegend,
}: {
  creatingPipe: boolean;
  onToggleCreatingPipe: () => void;
  nodeConnectOpen: boolean;
  onOpenNodeConnector: () => void;
  showContours: boolean;
  setShowContours: (updater: (v: boolean) => boolean) => void;
  showPressureNodes: boolean;
  setShowPressureNodes: (updater: (v: boolean) => boolean) => void;
  simMode: SimMode;
  onToggleSimMode: () => void;
  simActive: boolean;
  simBusy: boolean;
  onToggleSim: () => void;
  showLegend: boolean;
  setShowLegend: (updater: (v: boolean) => boolean) => void;
}) {
  return (
    <div
      style={{
        position: "absolute",
        right: 16,
        top: 16,
        zIndex: 1000,
        display: "grid",
        gap: 8,
        width: 170,
      }}
    >
      <button onClick={onToggleCreatingPipe} style={mainButtonStyle(creatingPipe, "rgba(37,99,235,0.95)")}>
        {creatingPipe ? "Cancelar dibujo" : "+ Cañería"}
      </button>

      <button
        onClick={onOpenNodeConnector}
        style={mainButtonStyle(nodeConnectOpen, "rgba(234,88,12,0.95)")}
        title="Crear una cañería conectando dos nodos existentes"
      >
        {nodeConnectOpen ? "Nodos: ON" : "Conectar nodos"}
      </button>

      <button
        onClick={() => setShowContours((v) => !v)}
        style={mainButtonStyle(showContours, "rgba(14,165,233,0.95)")}
        title="Mostrar curvas de nivel / topografía"
      >
        {showContours ? "Curvas: ON" : "Curvas"}
      </button>

      <button
        onClick={() => setShowPressureNodes((v) => !v)}
        style={mainButtonStyle(showPressureNodes, "rgba(20,184,166,0.95)", simActive ? 1 : 0.72)}
        title="Mostrar puntos de presión al simular"
      >
        {showPressureNodes ? "Puntos: ON" : "Puntos"}
      </button>

      <button
        onClick={onToggleSimMode}
        style={mainButtonStyle(true, simMode === "topografico" ? "rgba(99,102,241,0.95)" : "rgba(217,119,6,0.95)")}
        title="Cambiar modo de simulación"
      >
        {simMode === "topografico" ? "Modo: Topo" : "Modo: Hidr."}
      </button>

      <button
        onClick={onToggleSim}
        style={mainButtonStyle(simActive, "rgba(34,197,94,0.95)")}
        title={simActive ? "Quitar simulación" : "Correr simulación"}
      >
        {simBusy ? "Simulando..." : simActive ? "SIM: ON" : "SIM"}
      </button>

      <button
        onClick={() => setShowLegend((v) => !v)}
        style={{
          padding: "8px 10px",
          borderRadius: 12,
          border: "1px solid rgba(255,255,255,0.2)",
          background: showLegend ? "rgba(15,23,42,0.78)" : "rgba(15,23,42,0.5)",
          color: "#fff",
          fontWeight: 800,
          cursor: "pointer",
          fontSize: 12,
          boxShadow: "0 12px 25px rgba(0,0,0,0.22)",
        }}
      >
        {showLegend ? "Ocultar leyenda" : "Ver leyenda"}
      </button>
    </div>
  );
}
