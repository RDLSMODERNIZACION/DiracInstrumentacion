import React, { useEffect, useMemo, useRef, useState } from "react";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import Edge from "@/components/diagram/Edge";
import { useLiveQuery } from "@/lib/useLiveQuery";

import {
  computeBBox,
  isSet,
  layoutRow,
  nodesByIdAsArray,
  numberOr,
  toNumber,
} from "./layout";

import {
  CombinedNodeDTO,
  EdgeDTO,
  Tip,
  UINode,
  UIEdge,
  TankNode,
  PumpNode,
  ManifoldNode,
  ValveNode,
} from "./types";

import { loadLayoutFromStorage, saveLayoutToStorage, importLayout as importLayoutLS } from "@/layout/layoutIO";
import { fetchJSON, updateLayout, updateLayoutMany } from "./services/data";
import { createEdge as apiCreateEdge, deleteEdge as apiDeleteEdge } from "./services/edges";

import Tooltip from "./components/Tooltip";
import TankNodeView from "./components/nodes/TankNodeView";
import PumpNodeView from "./components/nodes/PumpNodeView";
import ManifoldNodeView from "./components/nodes/ManifoldNodeView";
import ValveNodeView from "./components/nodes/ValveNodeView";
import EditableEdge from "./components/edges/EditableEdge";

export default function InfraDiagram() {
  const [nodes, setNodes] = useState<UINode[]>([]);
  const [edges, setEdges] = useState<UIEdge[]>([]);
  const [viewBoxStr, setViewBoxStr] = useState("0 0 1000 520");

  // Edit mode state
  const [editMode, setEditMode] = useState(false);
  const [connectMode, setConnectMode] = useState(false);
  const [connectFrom, setConnectFrom] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<number | null>(null);

  // Tooltip
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [tip, setTip] = useState<Tip | null>(null);
  const showTip = (e: React.MouseEvent, content: { title: string; lines: string[] }) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    setTip({
      title: content.title,
      lines: content.lines,
      x: e.clientX - rect.left + 12,
      y: e.clientY - rect.top + 12,
    });
  };
  const hideTip = () => setTip(null);

  // Consulta viva cada 1s (configurada en QueryClient)
  const { data, isFetching, error } = useLiveQuery(
    ["infra", "layout"],
    async (signal) => {
      const [nodesRaw, edgesRaw] = await Promise.all([
        fetchJSON<CombinedNodeDTO[]>("/infraestructura/get_layout_combined", signal),
        fetchJSON<EdgeDTO[]>("/infraestructura/get_layout_edges", signal),
      ]);
      return { nodesRaw, edgesRaw };
    },
    (raw) => raw
  );

  // transformar a UI + aplicar layout + merge con localStorage
  useEffect(() => {
    if (!data) return;

    let uiNodes: UINode[] = (data.nodesRaw ?? []).map((n) => ({
      id: n.node_id,
      type: n.type,
      name: `${n.type} ${n.id}`,
      x: numberOr(n.x, 0),
      y: numberOr(n.y, 0),
      online: n.online ?? null,
      state: n.state ?? null,
      level_pct: toNumber(n.level_pct),
      alarma: n.alarma ?? null,
    })) as UINode[];

    const pumps = uiNodes.filter((n) => n.type === "pump") as PumpNode[];
    const tanks = uiNodes.filter((n) => n.type === "tank") as TankNode[];
    const manifolds = uiNodes.filter((n) => n.type === "manifold") as ManifoldNode[];
    const valves = uiNodes.filter((n) => n.type === "valve") as ValveNode[];

    const pumpsFixed = layoutRow(pumps, { startX: 140, startY: 380, gapX: 160 });
    const manifoldsFixed = layoutRow(manifolds, { startX: 480, startY: 260, gapX: 180 });
    const valvesFixed = layoutRow(valves, { startX: 640, startY: 260, gapX: 180 });
    const tanksFixed = layoutRow(tanks, { startX: 820, startY: 260, gapX: 180 });

    const fixedById: Record<string, UINode> = {};
    [...pumpsFixed, ...manifoldsFixed, ...valvesFixed, ...tanksFixed].forEach((n) => {
      fixedById[n.id] = n;
    });

    uiNodes = uiNodes.map((n) => {
      const f = fixedById[n.id];
      const x = isSet(n.x) ? n.x : f?.x ?? n.x;
      const y = isSet(n.y) ? n.y : f?.y ?? n.y;
      return { ...n, x, y } as UINode;
    });

    const uiEdges: UIEdge[] = (data.edgesRaw ?? []).map((e) => ({
      id: e.edge_id,
      a: e.src_node_id,
      b: e.dst_node_id,
      relacion: e.relacion,
      prioridad: e.prioridad,
    }));

    // Merge con layout guardado localmente (si existe)
    const saved = loadLayoutFromStorage();
    const cleaned = (saved ?? []).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
    const nodesWithSaved = cleaned.length ? (importLayoutLS(uiNodes, cleaned) as UINode[]) : uiNodes;

    setNodes(nodesWithSaved);
    setEdges(uiEdges);
  }, [data]);

  // mapas y viewBox
  const nodesById = useMemo(() => {
    const m: Record<string, UINode> = {};
    for (const n of nodes) {
      if (Number.isFinite(n.x) && Number.isFinite(n.y)) m[n.id] = n;
    }
    return m;
  }, [nodes]);

  useEffect(() => {
    if (!nodes.length) return;
    const bb = computeBBox(nodes, 60);
    setViewBoxStr(`${bb.minx} ${bb.miny} ${bb.w} ${bb.h}`);
  }, [nodes]);

  const getPos = (id: string) => {
    const n = nodesById[id];
    return n ? { x: n.x, y: n.y } : null;
  };
  const setPos = (id: string, x: number, y: number) => {
    setNodes((prev) => prev.map((n) => (n.id === id ? { ...n, x, y } : n)));
  };

  /** Guarda local y POST al backend para el nodo indicado */
  const saveNodePosition = async (id: string) => {
    try {
      const pos = getPos(id);
      if (!pos) return;
      saveLayoutToStorage(nodesByIdAsArray(nodesById));
      await updateLayout(id, pos.x, pos.y);
    } catch (e) {
      console.error("Error al actualizar layout:", e);
    }
  };

  // ====== Edit mode actions ======
  const toggleEdit = () => {
    const value = !editMode;
    setEditMode(value);
    if (!value) {
      setConnectMode(false);
      setConnectFrom(null);
      setSelectedEdgeId(null);
    }
  };

  const toggleConnect = () => {
    const value = !connectMode;
    setConnectMode(value);
    if (!value) setConnectFrom(null);
  };

  const handlePickNode = async (nodeId: string) => {
    if (!editMode || !connectMode) return;
    if (!connectFrom) {
      setConnectFrom(nodeId);
      return;
    }
    if (connectFrom === nodeId) {
      setConnectFrom(null);
      return;
    }
    // evitar duplicados
    const exists = edges.some((e) => e.a === connectFrom && e.b === nodeId);
    if (exists) {
      alert("Esa conexión ya existe.");
      setConnectFrom(null);
      return;
    }
    try {
      const created = await apiCreateEdge({ src_node_id: connectFrom, dst_node_id: nodeId });
      // refresco optimista
      setEdges((prev) => [
        { id: created.edge_id, a: created.src_node_id, b: created.dst_node_id, relacion: created.relacion, prioridad: created.prioridad },
        ...prev,
      ]);
    } catch (err: any) {
      console.error(err);
      alert(err?.message || "No se pudo crear la conexión");
    } finally {
      setConnectFrom(null);
    }
  };

  const handleDeleteEdge = async (edgeId: number) => {
    if (!editMode) return;
    if (!confirm("¿Borrar esta conexión?")) return;
    try {
      await apiDeleteEdge(edgeId);
      setEdges((prev) => prev.filter((e) => e.id !== edgeId));
    } catch (err: any) {
      console.error(err);
      alert(err?.message || "No se pudo borrar la conexión");
    }
  };

  const applyAutoLayout = async () => {
    // recalcular posiciones por tipo y persistir todas
    const pumps = nodes.filter((n) => n.type === "pump") as PumpNode[];
    const tanks = nodes.filter((n) => n.type === "tank") as TankNode[];
    const manifolds = nodes.filter((n) => n.type === "manifold") as ManifoldNode[];
    const valves = nodes.filter((n) => n.type === "valve") as ValveNode[];

    const newPumps = layoutRow(pumps, { startX: 140, startY: 380, gapX: 160 });
    const newManifolds = layoutRow(manifolds, { startX: 480, startY: 260, gapX: 180 });
    const newValves = layoutRow(valves, { startX: 640, startY: 260, gapX: 180 });
    const newTanks = layoutRow(tanks, { startX: 820, startY: 260, gapX: 180 });

    const byId: Record<string, UINode> = {};
    [...newPumps, ...newManifolds, ...newValves, ...newTanks].forEach((n) => (byId[n.id] = n));

    const next = nodes.map((n) => byId[n.id] ?? n);
    setNodes(next);

    // persistir
    const items = next.map((n) => ({ node_id: n.id, x: n.x, y: n.y }));
    try {
      await updateLayoutMany(items);
      saveLayoutToStorage(next);
    } catch (err) {
      console.error(err);
      alert("No se pudo guardar el auto-orden. Ver consola.");
    }
  };

  return (
    <div style={{ padding: 0 }}>
      {/* barra liviana */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 12, color: "#64748b", padding: "6px 8px" }}>
        {error ? (
          <span style={{ color: "#b91c1c" }}>Error: {(error as Error)?.message || "Error desconocido"}</span>
        ) : isFetching ? (
          "Actualizando…"
        ) : (
          "Sincronizado"
        )}
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button
            onClick={toggleEdit}
            style={{
              padding: "4px 8px",
              borderRadius: 8,
              border: "1px solid #cbd5e1",
              background: editMode ? "#0ea5e9" : "#ffffff",
              color: editMode ? "#ffffff" : "#0f172a",
            }}
          >
            {editMode ? "Salir edición" : "Editar"}
          </button>
          <button
            onClick={applyAutoLayout}
            disabled={!editMode}
            style={{ padding: "4px 8px", borderRadius: 8, border: "1px solid #cbd5e1", background: "#ffffff" }}
          >
            Auto-ordenar
          </button>
          <button
            onClick={toggleConnect}
            disabled={!editMode}
            style={{
              padding: "4px 8px",
              borderRadius: 8,
              border: "1px solid #cbd5e1",
              background: connectMode ? "#0ea5e9" : "#ffffff",
              color: connectMode ? "#ffffff" : "#0f172a",
            }}
          >
            {connectMode ? "Conectar: ON" : "Conectar"}
          </button>
        </div>
      </div>

      {!error && (
        <div
          ref={wrapRef}
          style={{
            position: "relative",
            border: "1px solid #e2e8f0",
            borderRadius: 12,
            overflow: "hidden",
            background: "#ffffff",
          }}
        >
          <TransformWrapper initialScale={1} minScale={0.6} maxScale={2.5} wheel={{ step: 0.1 }}>
            <TransformComponent wrapperStyle={{ width: "100%" }}>
              <svg width={1000} height={520} viewBox={viewBoxStr} style={{ display: "block", width: "100%" }}>
                <defs>
                  <pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse">
                    <path d="M 24 0 L 0 0 0 24" fill="none" stroke="#e2e8f0" strokeWidth="1" />
                  </pattern>
                  <marker id="arrow" markerWidth="10" markerHeight="10" refX="10" refY="3" orient="auto" markerUnits="strokeWidth" viewBox="0 0 10 10">
                    <path d="M 0 0 L 10 3 L 0 6 z" fill="#64748b" />
                  </marker>
                  <filter id="dropshadow" x="-20%" y="-20%" width="140%" height="140%">
                    <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#0f172a" floodOpacity="0.12" />
                  </filter>
                  <filter id="glow">
                    <feGaussianBlur stdDeviation="2.5" result="coloredBlur" />
                    <feMerge>
                      <feMergeNode in="coloredBlur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                  <linearGradient id="lgTank" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f5f7fa" />
                    <stop offset="100%" stopColor="#e9edf2" />
                  </linearGradient>
                  <linearGradient id="lgSteel" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#f8fafc" />
                    <stop offset="50%" stopColor="#e2e8f0" />
                    <stop offset="100%" stopColor="#f8fafc" />
                  </linearGradient>
                  <linearGradient id="lgGlass" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ffffff" stopOpacity="0.55" />
                    <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
                  </linearGradient>
                  <linearGradient id="lgWaterDeep" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#cfe6ff" />
                    <stop offset="100%" stopColor="#7bb3f8" />
                  </linearGradient>
                </defs>

                {/* Fondo */}
                <rect x="0" y="0" width="1000" height="520" fill="#ffffff" />
                <rect x="0" y="0" width="1000" height="520" fill="url(#grid)" opacity={0.6} />

                {/* Aristas (editable si editMode) */}
                {edges.map((e, idx) =>
                  editMode ? (
                    <EditableEdge
                      key={`edge-${e.id}-${idx}`}
                      id={e.id}
                      a={e.a}
                      b={e.b}
                      nodesById={nodesById}
                      editable={editMode}
                      onDelete={handleDeleteEdge}
                      selected={selectedEdgeId === e.id}
                    />
                  ) : (
                    <Edge key={`edge-${idx}`} a={e.a} b={e.b} nodesById={nodesById as any} />
                  )
                )}

                {/* Nodos */}
                {nodes.map((n) =>
                  n.type === "tank" ? (
                    <TankNodeView
                      key={n.id}
                      n={n as TankNode}
                      getPos={getPos}
                      setPos={setPos}
                      onDragEnd={() => saveNodePosition(n.id)}
                      showTip={showTip}
                      hideTip={hideTip}
                      enabled={editMode}
                      onClick={() => handlePickNode(n.id)}
                    />
                  ) : n.type === "pump" ? (
                    <PumpNodeView
                      key={n.id}
                      n={n as PumpNode}
                      getPos={getPos}
                      setPos={setPos}
                      onDragEnd={() => saveNodePosition(n.id)}
                      showTip={showTip}
                      hideTip={hideTip}
                      enabled={editMode}
                      onClick={() => handlePickNode(n.id)}
                    />
                  ) : n.type === "manifold" ? (
                    <ManifoldNodeView
                      key={n.id}
                      n={n as ManifoldNode}
                      getPos={getPos}
                      setPos={setPos}
                      onDragEnd={() => saveNodePosition(n.id)}
                      showTip={showTip}
                      hideTip={hideTip}
                      enabled={editMode}
                      onClick={() => handlePickNode(n.id)}
                    />
                  ) : n.type === "valve" ? (
                    <ValveNodeView
                      key={n.id}
                      n={n as ValveNode}
                      getPos={getPos}
                      setPos={setPos}
                      onDragEnd={() => saveNodePosition(n.id)}
                      showTip={showTip}
                      hideTip={hideTip}
                      enabled={editMode}
                      onClick={() => handlePickNode(n.id)}
                    />
                  ) : null
                )}

                {/* (Opcional) línea guía de conexión en vivo */}
                {/* Dejo preparado el espacio por si querés mostrar un cable fantasma hacia el mouse */}
              </svg>
            </TransformComponent>

            {/* Tooltip overlay */}
            <Tooltip tip={tip} />
          </TransformWrapper>
        </div>
      )}
    </div>
  );
}
