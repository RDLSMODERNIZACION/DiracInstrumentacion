// src/components/map/PipeConnectDrawer.tsx
import React from "react";
import { connectPipe } from "../features/mapa/services/simApi";

type NodeLite = { id: string; kind?: string; label?: string };

export default function PipeConnectDrawer({
  open,
  onClose,
  pipeId,
  nodes,
  initialFrom,
  initialTo,
  onConnected,
}: {
  open: boolean;
  onClose: () => void;
  pipeId: string | null;
  nodes: NodeLite[];
  initialFrom?: string | null;
  initialTo?: string | null;
  onConnected?: (from: string, to: string) => void;
}) {
  // ✅ Hooks SIEMPRE arriba (no condicionales)
  const [fromNode, setFromNode] = React.useState<string>("");
  const [toNode, setToNode] = React.useState<string>("");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  // ✅ useMemo SIEMPRE se ejecuta (antes del return)
  const sorted = React.useMemo(() => {
    const arr = Array.isArray(nodes) ? [...nodes] : [];
    arr.sort((a, b) => (a.label || a.id).localeCompare(b.label || b.id));
    return arr;
  }, [nodes]);

  // ✅ al abrir/cambiar pipe, resetea selección (sin romper orden de hooks)
  React.useEffect(() => {
    if (!open) return;
    setFromNode(initialFrom ?? "");
    setToNode(initialTo ?? "");
    setErr(null);
  }, [open, pipeId, initialFrom, initialTo]);

  async function save() {
    if (!pipeId) return;

    if (!fromNode || !toNode) {
      setErr("Elegí nodo origen y destino.");
      return;
    }
    if (fromNode === toNode) {
      setErr("Origen y destino no pueden ser el mismo nodo.");
      return;
    }

    setBusy(true);
    setErr(null);
    try {
      await connectPipe(pipeId, fromNode, toNode);
      onConnected?.(fromNode, toNode);
      onClose();
    } catch (e: any) {
      setErr(e?.message || "Error conectando pipe");
    } finally {
      setBusy(false);
    }
  }

  // ✅ return condicional DESPUÉS de los hooks
  if (!open || !pipeId) return null;

  return (
    <div className="fixed right-0 top-0 h-full w-[360px] bg-white shadow-2xl z-[2000] border-l">
      <div className="p-3 border-b flex items-center justify-between">
        <div className="font-semibold">Conectar cañería</div>
        <button className="px-2 py-1 text-sm rounded border" onClick={onClose} type="button">
          Cerrar
        </button>
      </div>

      <div className="p-3 space-y-3">
        <div className="text-xs text-slate-500 break-all">
          Pipe: <span className="font-mono">{pipeId}</span>
        </div>

        <div className="space-y-1">
          <div className="text-sm font-medium">Nodo origen</div>
          <select
            className="w-full border rounded px-2 py-2 text-sm"
            value={fromNode}
            onChange={(e) => setFromNode(e.target.value)}
          >
            <option value="">— elegir —</option>
            {sorted.map((n) => (
              <option key={n.id} value={n.id}>
                {(n.label ? `${n.label} ` : "")}[{n.kind ?? "JUNCTION"}] {n.id.slice(0, 8)}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <div className="text-sm font-medium">Nodo destino</div>
          <select
            className="w-full border rounded px-2 py-2 text-sm"
            value={toNode}
            onChange={(e) => setToNode(e.target.value)}
          >
            <option value="">— elegir —</option>
            {sorted.map((n) => (
              <option key={n.id} value={n.id}>
                {(n.label ? `${n.label} ` : "")}[{n.kind ?? "JUNCTION"}] {n.id.slice(0, 8)}
              </option>
            ))}
          </select>
        </div>

        {err && <div className="text-sm text-red-600">{err}</div>}

        <button
          className="w-full bg-black text-white rounded px-3 py-2 disabled:opacity-50"
          onClick={save}
          disabled={busy}
          type="button"
        >
          {busy ? "Guardando..." : "Guardar conexión"}
        </button>

        <div className="text-xs text-slate-500">
          Tip: si una cañería no tiene nodos conectados, la simulación la ignora.
        </div>
      </div>
    </div>
  );
}
