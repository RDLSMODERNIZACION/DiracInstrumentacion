import type { CSSProperties, MouseEvent } from "react";
import type { PipeConnHint } from "./mapTypes";
import type { SimRunResponse } from "./PipesLayer";

type Action = () => void | Promise<void>;

function stop(e: MouseEvent) {
  e.preventDefault();
  e.stopPropagation();
}

async function run(e: MouseEvent<HTMLButtonElement>, fn: Action) {
  e.preventDefault();
  e.stopPropagation();
  await fn();
}

export default function PipePopup({
  selectedPipeId,
  selectedPipeLabel,
  selectedPipePos,
  connHint,
  sim,
  nodesBusy,
  onEdit,
  onEditGeometry,
  onConnect,
  onCreateValve,
  onDelete,
  onClose,
}: {
  selectedPipeId: string;
  selectedPipeLabel: string | null;
  selectedPipePos?: [number, number] | null;
  connHint: PipeConnHint;
  sim: SimRunResponse | null;
  nodesBusy: boolean;
  onEdit: () => void;
  onEditGeometry: () => void;
  onConnect: () => void | Promise<void>;
  onCreateValve?: () => void | Promise<void>;
  onDelete: () => void | Promise<void>;
  onClose: () => void;
}) {
  const connected = Boolean(connHint.connected);

  return (
    <div
      className="pipePopupFixed"
      onClick={stop}
      onMouseDown={stop}
      onDoubleClick={stop}
      style={panelStyle}
    >
      <button
        type="button"
        onClick={(e) => run(e, onClose)}
        onMouseDown={stop}
        title="Cerrar"
        style={closeBtn}
      >
        ×
      </button>

      <div style={{ paddingRight: 44 }}>
        <div style={headerRow}>
          <div style={{ minWidth: 0 }}>
            <div style={titleStyle}>Cañería seleccionada</div>
            <div style={subtitleStyle}>
              {connected ? "Conectada hidráulicamente" : "Falta conexión hidráulica"}
              {sim ? " · simulación activa" : ""}
            </div>
          </div>

          <span
            style={{
              ...badgeStyle,
              background: connected ? "rgba(34,197,94,0.18)" : "rgba(245,158,11,0.18)",
              borderColor: connected ? "rgba(34,197,94,0.35)" : "rgba(245,158,11,0.38)",
              color: connected ? "#bbf7d0" : "#fde68a",
            }}
          >
            {connected ? "CONECTADA" : "SIN CONECTAR"}
          </span>
        </div>

        <div style={actionsGrid}>
          <button
            type="button"
            onClick={(e) => run(e, onEdit)}
            onMouseDown={stop}
            style={btnPrimary}
          >
            Editar datos
          </button>

          <button
            type="button"
            onClick={(e) => run(e, onEditGeometry)}
            onMouseDown={stop}
            style={btnSecondary}
            title="Ajusta el dibujo/recorrido de la cañería. No cambia necesariamente los nodos hidráulicos."
          >
            Recorrido
          </button>

          <button
            type="button"
            disabled={nodesBusy}
            onClick={(e) => run(e, onConnect)}
            onMouseDown={stop}
            title={
              nodesBusy
                ? "Cargando nodos..."
                : connected
                ? "Modificar conexión hidráulica"
                : "Conectar a nodos"
            }
            style={{
              ...btnSecondary,
              opacity: nodesBusy ? 0.6 : 1,
              cursor: nodesBusy ? "default" : "pointer",
            }}
          >
            {nodesBusy ? "Nodos..." : connected ? "Conexión" : "Conectar"}
          </button>

          <button
            type="button"
            disabled={!onCreateValve}
            onClick={(e) => run(e, onCreateValve ?? (() => {}))}
            onMouseDown={stop}
            style={{
              ...btnValve,
              opacity: onCreateValve ? 1 : 0.55,
              cursor: onCreateValve ? "pointer" : "default",
            }}
            title="Crear una válvula manual sobre esta cañería"
          >
            Válvula
          </button>

          <button
            type="button"
            onClick={async (e) => {
              e.preventDefault();
              e.stopPropagation();

              const ok = confirm(`¿Borrar cañería "${selectedPipeLabel ?? selectedPipeId}"?`);
              if (!ok) return;

              await onDelete();
            }}
            onMouseDown={stop}
            style={btnDanger}
          >
            Borrar
          </button>
        </div>
      </div>
    </div>
  );
}

const panelStyle: CSSProperties = {
  position: "absolute",
  left: "50%",
  bottom: 18,
  transform: "translateX(-50%)",
  zIndex: 5000,
  width: "min(760px, calc(100% - 32px))",
  borderRadius: 20,
  background: "rgba(15,23,42,0.96)",
  color: "#fff",
  boxShadow: "0 20px 55px rgba(0,0,0,0.38)",
  border: "1px solid rgba(255,255,255,0.16)",
  padding: 14,
  backdropFilter: "blur(10px)",
  pointerEvents: "auto",
};

const headerRow: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  marginBottom: 12,
};

const titleStyle: CSSProperties = {
  fontSize: 15,
  fontWeight: 950,
  lineHeight: 1.15,
};

const subtitleStyle: CSSProperties = {
  marginTop: 3,
  fontSize: 12,
  color: "rgba(255,255,255,0.66)",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const badgeStyle: CSSProperties = {
  flex: "0 0 auto",
  border: "1px solid rgba(255,255,255,0.14)",
  borderRadius: 999,
  padding: "5px 9px",
  fontSize: 11,
  fontWeight: 950,
  letterSpacing: 0.3,
};

const actionsGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(118px, 1fr))",
  gap: 9,
  alignItems: "center",
};

const btnBase: CSSProperties = {
  border: "1px solid rgba(255,255,255,0.18)",
  borderRadius: 13,
  color: "#fff",
  padding: "11px 13px",
  fontWeight: 950,
  cursor: "pointer",
  minWidth: 110,
  fontSize: 14,
  whiteSpace: "nowrap",
};

const btnPrimary: CSSProperties = {
  ...btnBase,
  background: "rgba(37,99,235,0.98)",
};

const btnSecondary: CSSProperties = {
  ...btnBase,
  background: "rgba(255,255,255,0.09)",
};

const btnValve: CSSProperties = {
  ...btnBase,
  background: "rgba(239,68,68,0.88)",
};

const btnDanger: CSSProperties = {
  ...btnBase,
  background: "rgba(127,29,29,0.95)",
};

const closeBtn: CSSProperties = {
  position: "absolute",
  right: 10,
  top: 10,
  width: 38,
  height: 38,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.18)",
  background: "rgba(255,255,255,0.11)",
  color: "#fff",
  cursor: "pointer",
  fontSize: 24,
  lineHeight: "30px",
  fontWeight: 950,
};