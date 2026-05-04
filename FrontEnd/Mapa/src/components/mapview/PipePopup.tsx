import type { MouseEvent } from "react";
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
  onDelete: () => void | Promise<void>;
  onClose: () => void;
}) {
  return (
    <div
      className="pipePopupFixed"
      onClick={stop}
      onMouseDown={stop}
      onDoubleClick={stop}
      style={{
        position: "absolute",
        left: "50%",
        bottom: 18,
        transform: "translateX(-50%)",
        zIndex: 5000,
        width: "min(620px, calc(100% - 32px))",
        borderRadius: 18,
        background: "rgba(15,23,42,0.96)",
        color: "#fff",
        boxShadow: "0 20px 55px rgba(0,0,0,0.38)",
        border: "1px solid rgba(255,255,255,0.16)",
        padding: "14px 56px 14px 14px",
        backdropFilter: "blur(10px)",
        pointerEvents: "auto",
      }}
    >
      <button
        type="button"
        onClick={(e) => run(e, onClose)}
        onMouseDown={stop}
        title="Cerrar"
        style={{
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
        }}
      >
        ×
      </button>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 10,
          alignItems: "center",
        }}
      >
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
        >
          Recorrido
        </button>

        <button
          type="button"
          disabled={nodesBusy}
          onClick={(e) => run(e, onConnect)}
          onMouseDown={stop}
          title={nodesBusy ? "Cargando nodos..." : connHint.connected ? "Modificar conexión" : "Conectar a nodos"}
          style={{
            ...btnSecondary,
            opacity: nodesBusy ? 0.6 : 1,
            cursor: nodesBusy ? "default" : "pointer",
          }}
        >
          {nodesBusy ? "Nodos..." : connHint.connected ? "Conexión" : "Conectar"}
        </button>

        <button
          type="button"
          onClick={async (e) => {
            e.preventDefault();
            e.stopPropagation();

            const ok = confirm(`¿Borrar cañería "${selectedPipeLabel ?? ""}"?`);
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
  );
}

const btnBase: React.CSSProperties = {
  border: "1px solid rgba(255,255,255,0.18)",
  borderRadius: 13,
  color: "#fff",
  padding: "12px 16px",
  fontWeight: 950,
  cursor: "pointer",
  minWidth: 130,
  fontSize: 15,
};

const btnPrimary: React.CSSProperties = {
  ...btnBase,
  background: "rgba(37,99,235,0.98)",
};

const btnSecondary: React.CSSProperties = {
  ...btnBase,
  background: "rgba(255,255,255,0.09)",
};

const btnDanger: React.CSSProperties = {
  ...btnBase,
  background: "rgba(220,38,38,0.9)",
};