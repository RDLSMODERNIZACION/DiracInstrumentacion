import { Popup } from "react-leaflet";
import type { PipeConnHint } from "./mapTypes";
import type { SimRunResponse } from "./PipesLayer";

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
  selectedPipePos: [number, number];
  connHint: PipeConnHint;
  sim: SimRunResponse | null;
  nodesBusy: boolean;
  onEdit: () => void;
  onEditGeometry: () => void;
  onConnect: () => void | Promise<void>;
  onDelete: () => void | Promise<void>;
  onClose: () => void;
}) {
  const simPipe = sim?.pipes?.[selectedPipeId];

  return (
    <Popup position={selectedPipePos} className="pipe-popup" closeButton={true} autoClose={false}>
      <div className="pipePopup">
        <div className="pipePopup__title" title={selectedPipeLabel ?? ""}>
          {selectedPipeLabel ?? "Cañería"}
        </div>

        <div className="pipePopup__statusRow">
          <span
            className={
              connHint.connected
                ? "pipePopup__badge pipePopup__badge--ok"
                : "pipePopup__badge pipePopup__badge--warn"
            }
          >
            {connHint.connected ? "Conectada" : "Sin conectar"}
          </span>

          {connHint.connected ? (
            <span className="pipePopup__connText">
              {connHint.from_node?.slice(0, 8)} → {connHint.to_node?.slice(0, 8)}
            </span>
          ) : (
            <span className="pipePopup__connText">Falta origen/destino</span>
          )}
        </div>

        <div className="pipePopup__actions">
          <button
            className="pipePopup__btn pipePopup__btn--primary"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onEdit();
            }}
          >
            Editar
          </button>

          <button
            className="pipePopup__btn"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onEditGeometry();
            }}
          >
            Recorrido
          </button>

          <button
            className="pipePopup__btn"
            onClick={async (e) => {
              e.preventDefault();
              e.stopPropagation();
              await onConnect();
            }}
            title={nodesBusy ? "Cargando nodos..." : connHint.connected ? "Modificar conexión" : "Conectar a nodos"}
          >
            {nodesBusy ? "Nodos..." : connHint.connected ? "Conexión" : "Conectar"}
          </button>

          <button
            className="pipePopup__btn"
            onClick={async (e) => {
              e.preventDefault();
              e.stopPropagation();

              const ok = confirm(`¿Borrar cañería "${selectedPipeLabel ?? ""}"?`);
              if (!ok) return;

              await onDelete();
            }}
          >
            Borrar
          </button>

          <button
            className="pipePopup__btn"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onClose();
            }}
          >
            Cerrar
          </button>
        </div>

        {simPipe && (
          <div style={{ marginTop: 10, fontSize: 12, opacity: 0.9 }}>
            <div>
              <b>Q visual</b>: {Number(simPipe.q_lps ?? 0).toFixed(3)} L/s {" "}
              ({simPipe.dir === 1 ? "from→to" : "to→from"})
            </div>

            <div>
              <b>ΔH</b>: {" "}
              {simPipe.dH_m == null ? "N/D" : Number(simPipe.dH_m).toFixed(2)} m
            </div>

            {simPipe.blocked && <div style={{ fontWeight: 800, color: "#b91c1c" }}>BLOQUEADO</div>}
          </div>
        )}
      </div>
    </Popup>
  );
}
