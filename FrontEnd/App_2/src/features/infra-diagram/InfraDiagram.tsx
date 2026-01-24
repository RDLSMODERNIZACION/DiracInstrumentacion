import React, { useEffect, useMemo, useRef, useState } from "react";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import Edge from "@/components/diagram/Edge";
import { useLiveQuery } from "@/lib/useLiveQuery";

import { computeBBox, isSet, layoutRow, nodesByIdAsArray, numberOr, toNumber } from "./layout";

import { CombinedNodeDTO, EdgeDTO, Tip, UINode, UIEdge, TankNode, PumpNode, ManifoldNode, ValveNode } from "./types";

import { loadLayoutFromStorage, saveLayoutToStorage, importLayout as importLayoutLS } from "@/layout/layoutIO";

import { fetchJSON, updateLayout, updateLayoutMany } from "./services/data";
import { createEdge as apiCreateEdge, deleteEdge as apiDeleteEdge } from "./services/edges";

import Tooltip from "./components/Tooltip";
import TankNodeView from "./components/nodes/TankNodeView";
import PumpNodeView from "./components/nodes/PumpNodeView";
import ManifoldNodeView from "./components/nodes/ManifoldNodeView";
import ValveNodeView from "./components/nodes/ValveNodeView";
import EditableEdge from "./components/edges/EditableEdge";
import OpsDrawer from "./components/OpsDrawer";
import LocationDrawer from "./components/LocationDrawer";

type LocationGroup = {
  key: string;
  name: string;
  bbox: { minx: number; miny: number; w: number; h: number };
  location_id: number | null;
};

export default function InfraDiagram() {
  // altura de la barra superior (en px)
  const TOPBAR_H = 44;

  // ✅ Zoom máximo inicial (arranca “cerca”)
  const ZOOM_MAX = 5;

  // ✅ URL del mapa (full page)
  const MAPA_URL = "https://www.diracserviciosenergia.com/mapa";

  const [nodes, setNodes] = useState<UINode[]>([]);
  const [edges, setEdges] = useState<UIEdge[]>([]);

  // viewBox dinámico
  const [viewBoxStr, setViewBoxStr] = useState("0 0 1000 520");
  const [vb, setVb] = useState({ minx: 0, miny: 0, w: 1000, h: 520 });

  // === DEBUG TOOLS ===
  const DEBUG = useMemo(() => {
    const qs = new URLSearchParams(window.location.search);
    return qs.get("debug") === "1" || import.meta.env.DEV;
  }, []);
  const log = (...args: any[]) => {
    if (DEBUG) console.log("[InfraDiagram]", ...args);
  };

  // Company scope leído del querystring (?company_id=XX)
  const companyId = useMemo(() => {
    const qs = new URLSearchParams(window.location.search);
    const raw = qs.get("company_id");
    if (raw == null) return null;
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const v = Number(trimmed);
    if (!Number.isFinite(v) || v <= 0) return null;
    return v;
  }, []);

  useEffect(() => {
    log("href:", window.location.href);
    log("companyId from query:", companyId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ✅ Ir a mapa saliendo del iframe si existe
  const goToMapa = () => {
    try {
      const w: any = window;
      const topWin = w.top || w;
      topWin.location.href = MAPA_URL;
    } catch {
      // Si el navegador bloquea top-navigation por sandbox, al menos abrimos nueva pestaña
      window.open(MAPA_URL, "_blank", "noopener,noreferrer");
    }
  };

  // Edit/Connect mode
  const [editMode, setEditMode] = useState(false);
  const [connectMode, setConnectMode] = useState(false);
  const [selectedEdgeId, setSelectedEdgeId] = useState<number | null>(null);

  // Node-RED ports state
  type PortRef = { nodeId: string; side: "out" | "in"; x: number; y: number };
  const [connectFrom, setConnectFrom] = useState<PortRef | null>(null);
  const [mouseSvg, setMouseSvg] = useState<{ x: number; y: number } | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  // Ops drawer (por nodo)
  const [opsOpen, setOpsOpen] = useState(false);
  const [opsNode, setOpsNode] = useState<UINode | null>(null);

  // Drawer de localidad
  const [locationDrawerOpen, setLocationDrawerOpen] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<{ id: number | null; name: string } | null>(null);

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

  // Consulta viva
  const { data, isFetching, error } = useLiveQuery(
    ["infra", "layout", companyId],
    async (signal) => {
      const urlNodes = `/infraestructura/get_layout_combined`;
      const urlEdges = `/infraestructura/get_layout_edges`;
      log("FETCH ->", urlNodes, "&&", urlEdges);

      const [nodesRaw, edgesRaw] = await Promise.all([
        fetchJSON<CombinedNodeDTO[]>(urlNodes, signal),
        fetchJSON<EdgeDTO[]>(urlEdges, signal),
      ]);

      log("FETCH DONE", {
        nodes: nodesRaw?.length ?? 0,
        edges: edgesRaw?.length ?? 0,
        types: summarizeTypes(nodesRaw),
      });

      return { nodesRaw, edgesRaw };
    },
    (raw) => raw
  );

  // Transformar a UI
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
      location_id: n.location_id ?? null,
      location_name: n.location_name ?? null,
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

    const saved = loadLayoutFromStorage();
    const cleaned = (saved ?? []).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
    const nodesWithSaved = cleaned.length ? (importLayoutLS(uiNodes, cleaned) as UINode[]) : uiNodes;

    setNodes(nodesWithSaved);
    setEdges(uiEdges);

    log("UI NODES", {
      total: nodesWithSaved.length,
      byType: summarizeTypes(nodesWithSaved.map((n) => ({ type: n.type }) as any)),
    });
    log("UI EDGES", { total: uiEdges.length });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  // Mapa por id
  const nodesById = useMemo(() => {
    const m: Record<string, UINode> = {};
    for (const n of nodes) {
      if (Number.isFinite(n.x) && Number.isFinite(n.y)) m[n.id] = n;
    }
    return m;
  }, [nodes]);

  // viewBox y fondo dinámicos + CLAMP (evita “zoom microscópico”)
  useEffect(() => {
    if (!nodes.length) return;

    const pad = 90;
    const bb = computeBBox(nodes, pad);

    // clamp: si un nodo quedó lejísimo, no te destruye la vista
    const MAX_W = 6000;
    const MAX_H = 3500;

    const safe = {
      minx: bb.minx,
      miny: bb.miny,
      w: Math.min(bb.w, MAX_W),
      h: Math.min(bb.h, MAX_H),
    };

    setVb(safe);
    setViewBoxStr(`${safe.minx} ${safe.miny} ${safe.w} ${safe.h}`);
  }, [nodes]);

  // ===== Fondos por ubicación =====
  const locationGroups: LocationGroup[] = useMemo(() => {
    if (!nodes.length) return [];

    const groups: Record<string, { key: string; name: string; nodes: UINode[]; location_id: number | null }> = {};

    for (const n of nodes) {
      const key =
        n.location_id != null
          ? String(n.location_id)
          : n.location_name
          ? `name:${n.location_name}`
          : "unknown";

      const locName = n.location_name || (n.location_id != null ? `Ubicación ${n.location_id}` : "Sin ubicación");

      if (!groups[key]) {
        groups[key] = { key, name: locName, nodes: [], location_id: n.location_id ?? null };
      }
      groups[key].nodes.push(n);
    }

    return Object.values(groups)
      .filter((g) => g.nodes.length > 0)
      .map((g) => {
        const bbox = computeBBox(g.nodes, 80);
        return { key: g.key, name: g.name, bbox, location_id: g.location_id };
      });
  }, [nodes]);

  const getPos = (id: string) => {
    const n = nodesById[id];
    return n ? { x: n.x, y: n.y } : null;
  };
  const setPos = (id: string, x: number, y: number) => {
    setNodes((prev) => prev.map((n) => (n.id === id ? { ...n, x, y } : n)));
  };

  const saveNodePosition = async (id: string) => {
    try {
      const pos = getPos(id);
      if (!pos) return;
      saveLayoutToStorage(nodesByIdAsArray(nodesById));
      await updateLayout(id, pos.x, pos.y);
      log("POSITION SAVED", { id, x: pos.x, y: pos.y });
    } catch (e) {
      console.error("Error al actualizar layout:", e);
    }
  };

  // ====== Edit / Connect ======
  const toggleEdit = () => {
    const next = !editMode;
    setEditMode(next);
    if (!next) {
      setConnectMode(false);
      setConnectFrom(null);
      setSelectedEdgeId(null);
    }
  };

  // ====== Node-RED helpers ======
  function halfByType(t?: string) {
    const tt = (t || "").toLowerCase();
    if (tt === "tank") return 66;
    if (tt === "pump") return 26;
    if (tt === "manifold") return 55;
    if (tt === "valve") return 14;
    return 20;
  }
  function portsOf(n: UINode) {
    const off = 6;
    return {
      in: { x: n.x - halfByType(n.type) - off, y: n.y },
      out: { x: n.x + halfByType(n.type) + off, y: n.y },
    };
  }
  function clientToSvgPoint(e: React.MouseEvent | React.PointerEvent) {
    if (!svgRef.current) return null;
    const pt = svgRef.current.createSVGPoint();
    pt.x = (e as any).clientX;
    pt.y = (e as any).clientY;
    const m = svgRef.current.getScreenCTM();
    if (!m) return null;
    const p = pt.matrixTransform(m.inverse());
    return { x: p.x, y: p.y };
  }
  function edgeExists(src: string, dst: string) {
    return edges.some((e) => e.a === src && e.b === dst);
  }
  async function tryCreateEdge(src: string, dst: string) {
    if (src === dst || edgeExists(src, dst)) return;
    try {
      const created = await apiCreateEdge({ src_node_id: src, dst_node_id: dst });
      setEdges((prev) => [
        { id: created.edge_id, a: created.src_node_id, b: created.dst_node_id, relacion: created.relacion, prioridad: created.prioridad },
        ...prev,
      ]);
      log("EDGE CREATED", { id: created.edge_id, src: created.src_node_id, dst: created.dst_node_id });
    } catch (err: any) {
      console.error(err);
      alert(err?.message || "No se pudo crear la conexión");
    }
  }

  // Keyboard: Delete para borrar, Esc cancelar
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setConnectFrom(null);
        setSelectedEdgeId(null);
        setOpsOpen(false);
        setLocationDrawerOpen(false);
        setSelectedLocation(null);
      } else if ((e.key === "Delete" || e.key === "Backspace") && selectedEdgeId != null && editMode) {
        e.preventDefault();
        handleDeleteEdge(selectedEdgeId);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [editMode, selectedEdgeId]);

  const handleDeleteEdge = async (edgeId: number) => {
    try {
      await apiDeleteEdge(edgeId);
      setEdges((prev) => prev.filter((e) => e.id !== edgeId));
      setSelectedEdgeId(null);
      log("EDGE DELETED", { edgeId });
    } catch (err: any) {
      console.error(err);
      alert(err?.message || "No se pudo borrar la conexión");
    }
  };

  const applyAutoLayout = async () => {
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

    try {
      await updateLayoutMany(next.map((n) => ({ node_id: n.id, x: n.x, y: n.y })));
      saveLayoutToStorage(next);
      log("AUTO-LAYOUT SAVED", { count: next.length });
    } catch (err) {
      console.error(err);
      alert("No se pudo guardar el auto-orden.");
    }
  };

  // preview path para cable fantasma
  function previewPath(sx: number, sy: number, ex: number, ey: number) {
    const mx = (sx + ex) / 2;
    return `M ${sx} ${sy} L ${mx} ${sy} L ${mx} ${ey} L ${ex} ${ey}`;
  }

  // abrir operación por nodo
  function maybeOpenOps(n: UINode) {
    if (editMode || connectMode) return;
    if (n.online !== true) return;
    setOpsNode(n);
    setOpsOpen(true);
  }

  // abrir drawer de localidad al hacer click en el fondo
  function handleLocationClick(g: LocationGroup) {
    setSelectedLocation({ id: g.location_id, name: g.name });
    setLocationDrawerOpen(true);
  }

  return (
    <div style={{ width: "100%", padding: 0 }}>
      {/* barra superior */}
      <div
        style={{
          height: TOPBAR_H,
          display: "flex",
          alignItems: "center",
          gap: 12,
          fontSize: 12,
          color: "#64748b",
          padding: "6px 8px",
          boxSizing: "border-box",
        }}
      >
        {error ? (
          <span style={{ color: "#b91c1c" }}>
            Error: {(error as Error)?.message || "Error desconocido"}
          </span>
        ) : isFetching ? (
          "Actualizando…"
        ) : (
          "Sincronizado"
        )}

        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          {/* ✅ NUEVO: botón Mapa */}
          <button
            onClick={goToMapa}
            title="Abrir Mapa"
            style={{
              padding: "4px 8px",
              borderRadius: 8,
              border: "1px solid #cbd5e1",
              background: "#ffffff",
              color: "#0f172a",
            }}
          >
            Mapa
          </button>

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
            style={{
              padding: "4px 8px",
              borderRadius: 8,
              border: "1px solid #cbd5e1",
              background: "#ffffff",
            }}
          >
            Auto-ordenar
          </button>

          <button
            onClick={() => setConnectMode((v) => !v)}
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

      {/* Contenedor principal */}
      {!error && (
        <div
          ref={wrapRef}
          style={{
            position: "relative",
            border: "1px solid #e2e8f0",
            borderRadius: 12,
            overflow: "hidden",
            background: "#ffffff",
            width: "100%",
            height: `calc(100vh - ${TOPBAR_H}px)`,
            boxSizing: "border-box",
          }}
        >
          <TransformWrapper initialScale={ZOOM_MAX} minScale={0.6} maxScale={ZOOM_MAX} centerOnInit wheel={{ step: 0.1 }}>
            <TransformComponent wrapperStyle={{ width: "100%", height: "100%" }}>
              <svg
                ref={svgRef}
                width="100%"
                height="100%"
                viewBox={viewBoxStr}
                preserveAspectRatio="none"
                style={{ display: "block" }}
                onMouseMove={(e) => {
                  if (!connectFrom) return;
                  const p = clientToSvgPoint(e);
                  if (p) setMouseSvg(p);
                }}
                onMouseDown={() => {
                  if (editMode) setSelectedEdgeId(null);
                }}
              >
                <defs>
                  <pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse">
                    <path d="M 24 0 L 0 0 0 24" fill="none" stroke="#e2e8f0" strokeWidth="1" />
                  </pattern>

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

                <rect x={vb.minx} y={vb.miny} width={vb.w} height={vb.h} fill="#ffffff" />
                <rect x={vb.minx} y={vb.miny} width={vb.w} height={vb.h} fill="url(#grid)" opacity={0.6} />

                {locationGroups.map((g) => (
                  <g
                    key={`loc-bg-${g.key}`}
                    style={{ cursor: "pointer" }}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleLocationClick(g);
                    }}
                  >
                    <rect
                      x={g.bbox.minx}
                      y={g.bbox.miny}
                      width={g.bbox.w}
                      height={g.bbox.h}
                      rx={18}
                      ry={18}
                      fill="#f8fafc"
                      stroke="#cbd5e1"
                      strokeWidth={1}
                    />
                    <text
                      x={g.bbox.minx + 16}
                      y={g.bbox.miny + 24}
                      style={{ fontSize: 12, fontWeight: 600, fill: "#64748b", pointerEvents: "none" }}
                    >
                      {g.name}
                    </text>
                  </g>
                ))}

                {edges.map((e) =>
                  editMode ? (
                    <EditableEdge
                      key={`edge-${e.id}`}
                      id={e.id}
                      a={e.a}
                      b={e.b}
                      nodesById={nodesById}
                      editable={editMode}
                      selected={selectedEdgeId === e.id}
                      onSelect={(id) => setSelectedEdgeId(id)}
                    />
                  ) : (
                    <Edge key={`edge-${e.id}`} a={e.a} b={e.b} nodesById={nodesById as any} />
                  )
                )}

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
                      onClick={() => (!editMode && !connectMode ? maybeOpenOps(n) : undefined)}
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
                      onClick={() => (!editMode && !connectMode ? maybeOpenOps(n) : undefined)}
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
                      onClick={() => (!editMode && !connectMode ? maybeOpenOps(n) : undefined)}
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
                      onClick={() => (!editMode && !connectMode ? maybeOpenOps(n) : undefined)}
                    />
                  ) : null
                )}

                {editMode &&
                  connectMode &&
                  nodes.map((n) => {
                    const P = portsOf(n);
                    return (
                      <g key={`ports-${n.id}`}>
                        <circle
                          cx={P.in.x}
                          cy={P.in.y}
                          r={5}
                          fill="#ffffff"
                          stroke="#64748b"
                          strokeWidth={1.6}
                          onMouseUp={() => {
                            if (connectFrom && connectFrom.side === "out") {
                              tryCreateEdge(connectFrom.nodeId, n.id);
                              setConnectFrom(null);
                              setMouseSvg(null);
                            }
                          }}
                        />
                        <circle
                          cx={P.out.x}
                          cy={P.out.y}
                          r={5}
                          fill="#ffffff"
                          stroke="#0ea5e9"
                          strokeWidth={1.8}
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            setSelectedEdgeId(null);
                            setOpsOpen(false);
                            setLocationDrawerOpen(false);
                            setConnectFrom({ nodeId: n.id, side: "out", x: P.out.x, y: P.out.y });
                            const p = clientToSvgPoint(e);
                            if (p) setMouseSvg(p);
                          }}
                        />
                      </g>
                    );
                  })}

                {editMode && connectMode && connectFrom && mouseSvg && (
                  <path
                    d={previewPath(connectFrom.x, connectFrom.y, mouseSvg.x, mouseSvg.y)}
                    stroke="#0ea5e9"
                    strokeWidth={2}
                    strokeDasharray="6 6"
                    fill="none"
                    opacity={0.9}
                  />
                )}
              </svg>
            </TransformComponent>

            <Tooltip tip={tip} />
          </TransformWrapper>
        </div>
      )}

      <OpsDrawer open={opsOpen} onClose={() => setOpsOpen(false)} node={opsNode} onCommandSent={() => {}} />

      <LocationDrawer
        open={locationDrawerOpen}
        onClose={() => {
          setLocationDrawerOpen(false);
          setSelectedLocation(null);
        }}
        location={selectedLocation}
      />
    </div>
  );
}

// util de debug para contar tipos
function summarizeTypes(rows: Array<{ type?: string } | any> | undefined) {
  const out: Record<string, number> = {};
  for (const r of rows || []) {
    const t = String((r as any).type ?? "").toLowerCase() || "unknown";
    out[t] = (out[t] ?? 0) + 1;
  }
  return out;
}
