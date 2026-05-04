// src/components/mapview/MapFloatingControls.tsx

import type { CSSProperties, ReactNode } from "react";
import type { SimMode } from "./mapTypes";
import type { PipeConnectivityStats } from "./PipesLayer";

type BoolSetter = (updater: (v: boolean) => boolean) => void;

function buttonStyle(active: boolean, activeBg: string, disabled = false): CSSProperties {
  return {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.14)",
    background: active ? activeBg : "rgba(255,255,255,0.05)",
    color: "#fff",
    fontWeight: 900,
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.58 : 1,
    textAlign: "center",
    transition: "all 0.15s ease",
  };
}

function sectionBoxStyle(): CSSProperties {
  return {
    borderRadius: 14,
    background: "rgba(255,255,255,0.035)",
    border: "1px solid rgba(255,255,255,0.08)",
    padding: 12,
  };
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        fontSize: 11,
        fontWeight: 950,
        letterSpacing: 0.6,
        textTransform: "uppercase",
        color: "rgba(255,255,255,0.68)",
        marginBottom: 10,
      }}
    >
      {children}
    </div>
  );
}

function StatusDot({ color }: { color: string }) {
  return (
    <span
      style={{
        width: 10,
        height: 10,
        borderRadius: 99,
        background: color,
        boxShadow: `0 0 0 3px ${color}22`,
        flex: "0 0 auto",
      }}
    />
  );
}

export default function MapFloatingControls({
  creatingPipe,
  onToggleCreatingPipe,

  nodeConnectOpen,
  onOpenNodeConnector,

  intersectionConnectOpen,
  onOpenIntersectionConnector,

  showContours,
  setShowContours,

  showPressureNodes,
  setShowPressureNodes,

  showElevationNodes,
  setShowElevationNodes,

  showDiameterTransitions,
  setShowDiameterTransitions,

  showValves,
  setShowValves,

  showMapAssets,
  setShowMapAssets,

  assetsPanelOpen,
  setAssetsPanelOpen,

  simMode,
  onToggleSimMode,

  simActive,
  simBusy,
  onToggleSim,

  showLegend,
  setShowLegend,

  pipeConnectivityStats,
  simErr,
}: {
  creatingPipe: boolean;
  onToggleCreatingPipe: () => void;

  nodeConnectOpen: boolean;
  onOpenNodeConnector: () => void;

  intersectionConnectOpen: boolean;
  onOpenIntersectionConnector: () => void;

  showContours: boolean;
  setShowContours: BoolSetter;

  showPressureNodes: boolean;
  setShowPressureNodes: BoolSetter;

  showElevationNodes: boolean;
  setShowElevationNodes: BoolSetter;

  showDiameterTransitions: boolean;
  setShowDiameterTransitions: BoolSetter;

  showValves: boolean;
  setShowValves: BoolSetter;

  showMapAssets: boolean;
  setShowMapAssets: BoolSetter;

  assetsPanelOpen: boolean;
  setAssetsPanelOpen: BoolSetter;

  simMode: SimMode;
  onToggleSimMode: () => void;

  simActive: boolean;
  simBusy: boolean;
  onToggleSim: () => void;

  showLegend: boolean;
  setShowLegend: BoolSetter;

  pipeConnectivityStats?: PipeConnectivityStats | null;
  simErr?: string | null;
}) {
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div>
        <div style={{ fontSize: 18, fontWeight: 950, lineHeight: 1.1 }}>
          Mapa hidráulico
        </div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.68)", marginTop: 3 }}>
          Edición, capas y simulación
        </div>
      </div>

      <div style={sectionBoxStyle()}>
        <SectionTitle>Herramientas</SectionTitle>

        <div style={{ display: "grid", gap: 8 }}>
          <button
            onClick={onToggleCreatingPipe}
            style={buttonStyle(creatingPipe, "rgba(37,99,235,0.96)")}
          >
            {creatingPipe ? "Cancelar cañería" : "+ Cañería"}
          </button>

          <button
            onClick={onOpenNodeConnector}
            style={buttonStyle(nodeConnectOpen, "rgba(234,88,12,0.96)")}
          >
            {nodeConnectOpen ? "Nodos: ON" : "Conectar nodos"}
          </button>

          <button
            onClick={onOpenIntersectionConnector}
            style={buttonStyle(intersectionConnectOpen, "rgba(239,68,68,0.96)")}
          >
            {intersectionConnectOpen ? "Cancelar cruce" : "Conectar cruce"}
          </button>
        </div>
      </div>

      <div style={sectionBoxStyle()}>
        <SectionTitle>Capas</SectionTitle>

        <div style={{ display: "grid", gap: 8 }}>
          <button
            onClick={() => setShowContours((v) => !v)}
            style={buttonStyle(showContours, "rgba(14,165,233,0.96)")}
          >
            {showContours ? "Curvas: ON" : "Curvas"}
          </button>

          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}>
            <button
              onClick={() => setShowMapAssets((v) => !v)}
              style={buttonStyle(showMapAssets, "rgba(168,85,247,0.96)")}
              title="Mostrar u ocultar los activos en el mapa"
            >
              {showMapAssets ? "Activos: ON" : "Activos"}
            </button>

            <button
              onClick={() => {
                setAssetsPanelOpen((v) => !v);

                if (!showMapAssets) {
                  setShowMapAssets(() => true);
                }
              }}
              style={{
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.14)",
                background: assetsPanelOpen
                  ? "rgba(168,85,247,0.32)"
                  : "rgba(255,255,255,0.05)",
                color: "#fff",
                fontWeight: 950,
                cursor: "pointer",
                minWidth: 46,
              }}
              title="Abrir panel de activos"
            >
              {assetsPanelOpen ? "‹" : "›"}
            </button>
          </div>

          <button
            onClick={() => setShowValves((v) => !v)}
            style={buttonStyle(showValves, "rgba(239,68,68,0.96)")}
            title="Mostrar válvulas manuales y su estado abierto/cerrado"
          >
            {showValves ? "Válvulas: ON" : "Válvulas"}
          </button>

          <button
            onClick={() => setShowPressureNodes((v) => !v)}
            style={buttonStyle(showPressureNodes, "rgba(20,184,166,0.96)")}
          >
            {showPressureNodes ? "Puntos: ON" : "Puntos"}
          </button>

          <button
            onClick={() => setShowElevationNodes((v) => !v)}
            style={buttonStyle(showElevationNodes, "rgba(234,179,8,0.96)")}
          >
            {showElevationNodes ? "Cotas: ON" : "Cotas"}
          </button>

          <button
            onClick={() => setShowDiameterTransitions((v) => !v)}
            style={buttonStyle(showDiameterTransitions, "rgba(249,115,22,0.96)")}
            title="Mostrar conexiones entre cañerías de distinto diámetro"
          >
            {showDiameterTransitions ? "Diámetros: ON" : "Diámetros"}
          </button>

          <button
            onClick={() => setShowLegend((v) => !v)}
            style={buttonStyle(showLegend, "rgba(100,116,139,0.95)")}
          >
            {showLegend ? "Leyenda: ON" : "Leyenda"}
          </button>
        </div>
      </div>

      <div style={sectionBoxStyle()}>
        <SectionTitle>Simulación</SectionTitle>

        <div style={{ display: "grid", gap: 8 }}>
          <button
            onClick={onToggleSimMode}
            style={buttonStyle(
              true,
              simMode === "topografico"
                ? "rgba(99,102,241,0.96)"
                : "rgba(217,119,6,0.96)"
            )}
          >
            {simMode === "topografico" ? "Modo: Topo" : "Modo: Hidr."}
          </button>

          <button
            onClick={onToggleSim}
            disabled={simBusy}
            style={buttonStyle(simActive, "rgba(34,197,94,0.96)", simBusy)}
          >
            {simBusy ? "Simulando..." : simActive ? "SIM: ON" : "SIM"}
          </button>
        </div>

        {simErr && (
          <div
            style={{
              marginTop: 10,
              background: "rgba(220,38,38,0.86)",
              border: "1px solid rgba(255,255,255,0.18)",
              borderRadius: 12,
              padding: 9,
              fontSize: 12,
              fontWeight: 800,
              lineHeight: 1.25,
            }}
          >
            {simErr}
          </div>
        )}
      </div>

      <div style={sectionBoxStyle()}>
        <SectionTitle>Estado red</SectionTitle>

        {pipeConnectivityStats ? (
          <div style={{ display: "grid", gap: 8, fontSize: 13 }}>
            <div style={statusRowStyle}>
              <StatusDot color="#22c55e" />
              <span>{pipeConnectivityStats.connected} conectadas</span>
            </div>

            <div style={statusRowStyle}>
              <StatusDot color="#f59e0b" />
              <span>{pipeConnectivityStats.unconnected} sin conectar</span>
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 12, opacity: 0.65 }}>Sin datos todavía</div>
        )}
      </div>
    </div>
  );
}

const statusRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontWeight: 800,
};