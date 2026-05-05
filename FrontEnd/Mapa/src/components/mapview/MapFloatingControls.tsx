// src/components/mapview/MapFloatingControls.tsx

import type { CSSProperties, ReactNode } from "react";
import type { SimMode } from "./mapTypes";
import type { PipeConnectivityStats } from "./PipesLayer";

type BoolSetter = (updater: (v: boolean) => boolean) => void;
type InsertMode = "none" | "valve" | "tank" | "pump";

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
    userSelect: "none",
  };
}

function toolButtonStyle(active: boolean, activeBg: string, disabled = false): CSSProperties {
  return {
    ...buttonStyle(active, activeBg, disabled),
    minHeight: 58,
    padding: "10px 8px",
    display: "grid",
    alignContent: "center",
    justifyItems: "center",
    gap: 3,
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

function ToolButton({
  active,
  disabled,
  color,
  icon,
  label,
  activeLabel,
  title,
  onClick,
}: {
  active: boolean;
  disabled?: boolean;
  color: string;
  icon: string;
  label: string;
  activeLabel?: string;
  title?: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={toolButtonStyle(active, color, disabled)}
    >
      <span style={{ fontSize: 18, lineHeight: 1 }}>{icon}</span>
      <span style={{ fontSize: 12, lineHeight: 1.1 }}>
        {active ? activeLabel ?? "Cancelar" : label}
      </span>
    </button>
  );
}

export default function MapFloatingControls({
  creatingPipe,
  onToggleCreatingPipe,

  /**
   * Compatibilidad con MapView viejo.
   * Más adelante se puede reemplazar por insertMode/onSelectInsertMode.
   */
  valveInsertMode = false,
  onToggleValveInsert,

  /**
   * Nuevo modo unificado.
   * Si MapView lo pasa, estos tienen prioridad para + Válvula/+ Tanque/+ Bomba.
   */
  insertMode,
  onSelectInsertMode,

  onAddTank,
  onAddPump,

  /**
   * Se mantienen por compatibilidad con MapViewScreen,
   * pero ya no se muestran como botones.
   * La conexión ahora se hace desde Editar recorrido al guardar.
   */
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

  valveInsertMode?: boolean;
  onToggleValveInsert?: () => void;

  insertMode?: InsertMode;
  onSelectInsertMode?: (mode: InsertMode) => void;

  onAddTank?: () => void;
  onAddPump?: () => void;

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
  const activeInsertMode: InsertMode =
    insertMode ?? (valveInsertMode ? "valve" : "none");

  /**
   * Evita warnings por props heredadas que ya no usamos visualmente.
   * Se dejan para no romper MapViewScreen mientras limpiamos la estructura.
   */
  void nodeConnectOpen;
  void onOpenNodeConnector;
  void intersectionConnectOpen;
  void onOpenIntersectionConnector;

  function toggleInsert(mode: InsertMode) {
    if (onSelectInsertMode) {
      onSelectInsertMode(activeInsertMode === mode ? "none" : mode);
      return;
    }

    if (mode === "valve" && onToggleValveInsert) {
      onToggleValveInsert();
      return;
    }

    if (mode === "tank") {
      onAddTank?.();
      return;
    }

    if (mode === "pump") {
      onAddPump?.();
    }
  }

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
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <ToolButton
              active={creatingPipe}
              color="rgba(37,99,235,0.96)"
              icon="➕"
              label="+ Cañería"
              activeLabel="Cancelar"
              title="Dibujar una nueva cañería"
              onClick={onToggleCreatingPipe}
            />

            <ToolButton
              active={activeInsertMode === "valve"}
              color="rgba(239,68,68,0.96)"
              icon="🚧"
              label="+ Válvula"
              activeLabel="Ubicando..."
              title="Insertar una válvula en un punto exacto de una cañería"
              onClick={() => toggleInsert("valve")}
            />

            <ToolButton
              active={activeInsertMode === "tank"}
              disabled={!onSelectInsertMode && !onAddTank}
              color="rgba(6,182,212,0.96)"
              icon="🛢️"
              label="+ Tanque"
              activeLabel="Ubicando..."
              title="Insertar o ubicar un tanque"
              onClick={() => toggleInsert("tank")}
            />

            <ToolButton
              active={activeInsertMode === "pump"}
              disabled={!onSelectInsertMode && !onAddPump}
              color="rgba(168,85,247,0.96)"
              icon="⚙️"
              label="+ Bomba"
              activeLabel="Ubicando..."
              title="Insertar o ubicar una bomba"
              onClick={() => toggleInsert("pump")}
            />
          </div>

          {activeInsertMode !== "none" && (
            <div
              style={{
                borderRadius: 12,
                padding: "9px 10px",
                background: "rgba(255,255,255,0.055)",
                border: "1px solid rgba(255,255,255,0.10)",
                color: "rgba(255,255,255,0.82)",
                fontSize: 12,
                lineHeight: 1.3,
                fontWeight: 800,
              }}
            >
              {activeInsertMode === "valve" &&
                "Tocá la cañería en el punto exacto donde va la válvula."}
              {activeInsertMode === "tank" &&
                "Tocá la cañería o el punto donde querés ubicar el tanque."}
              {activeInsertMode === "pump" &&
                "Tocá la cañería o el punto donde querés ubicar la bomba."}
            </div>
          )}

          <div
            style={{
              borderRadius: 12,
              padding: "10px 11px",
              background: "rgba(34,197,94,0.10)",
              border: "1px solid rgba(34,197,94,0.25)",
              color: "rgba(255,255,255,0.84)",
              fontSize: 12,
              lineHeight: 1.35,
              fontWeight: 800,
            }}
          >
            Las conexiones de nodos y cruces ahora se hacen automáticamente desde{" "}
            <b>Editar recorrido</b> al guardar.
          </div>
        </div>
      </div>

      <div style={sectionBoxStyle()}>
        <SectionTitle>Capas</SectionTitle>

        <div style={{ display: "grid", gap: 8 }}>
          <button
            type="button"
            onClick={() => setShowContours((v) => !v)}
            style={buttonStyle(showContours, "rgba(14,165,233,0.96)")}
          >
            {showContours ? "Curvas: ON" : "Curvas"}
          </button>

          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}>
            <button
              type="button"
              onClick={() => setShowMapAssets((v) => !v)}
              style={buttonStyle(showMapAssets, "rgba(168,85,247,0.96)")}
              title="Mostrar u ocultar los activos en el mapa"
            >
              {showMapAssets ? "Activos: ON" : "Activos"}
            </button>

            <button
              type="button"
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
            type="button"
            onClick={() => setShowValves((v) => !v)}
            style={buttonStyle(showValves, "rgba(239,68,68,0.96)")}
            title="Mostrar válvulas manuales y su estado abierto/cerrado"
          >
            {showValves ? "Válvulas: ON" : "Válvulas"}
          </button>

          <button
            type="button"
            onClick={() => setShowPressureNodes((v) => !v)}
            style={buttonStyle(showPressureNodes, "rgba(20,184,166,0.96)")}
          >
            {showPressureNodes ? "Puntos: ON" : "Puntos"}
          </button>

          <button
            type="button"
            onClick={() => setShowElevationNodes((v) => !v)}
            style={buttonStyle(showElevationNodes, "rgba(234,179,8,0.96)")}
          >
            {showElevationNodes ? "Cotas: ON" : "Cotas"}
          </button>

          <button
            type="button"
            onClick={() => setShowDiameterTransitions((v) => !v)}
            style={buttonStyle(showDiameterTransitions, "rgba(249,115,22,0.96)")}
            title="Mostrar conexiones entre cañerías de distinto diámetro"
          >
            {showDiameterTransitions ? "Diámetros: ON" : "Diámetros"}
          </button>

          <button
            type="button"
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
            type="button"
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
            type="button"
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