import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import { useLiveQuery } from "@/lib/useLiveQuery";

import { computeBBox, isSet, layoutRow, nodesByIdAsArray, numberOr, toNumber } from "./layout";
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
  getNodePorts as getPortsByType,
} from "./types";

import { saveLayoutToStorage } from "@/layout/layoutIO";
import { fetchJSON, updateLayout, updateLayoutMany } from "./services/data";
import { createEdge as apiCreateEdge, deleteEdge as apiDeleteEdge } from "./services/edges";
import { getPumpPipeTaps, savePumpPipeTap, type PumpPipeTap, type PumpPipeTapMode } from "./services/pumpTaps";
import { saveNodeServicio, type ServicioSCADA } from "./services/nodeServicio";
import { getPumpAvailability, savePumpAvailability, type PumpAvailability } from "./services/pumpAvailability";

import Tooltip from "./components/Tooltip";
import TankNodeView from "./components/nodes/TankNodeView";
import PumpNodeView from "./components/nodes/PumpNodeView";
import ManifoldNodeView from "./components/nodes/ManifoldNodeView";
import ValveNodeView from "./components/nodes/ValveNodeView";
import EditableEdge from "./components/edges/EditableEdge";
import OpsDrawer from "./components/OpsDrawer";
import LocationDrawer from "./components/LocationDrawer";
import NetworkAnalyzerNodeView from "./components/nodes/NetworkAnalyzerNodeView";
import PumpPipeTapView from "./components/PumpPipeTapView";

/** =========================
 *  Types
 *  ========================= */

type LocationGroup = {
  key: string;
  name: string;
  bbox: { minx: number; miny: number; w: number; h: number };
  location_id: number | null;
};

type UIEdgeWithPorts = UIEdge & {
  a_port?: string | null;
  b_port?: string | null;
  knots?: Array<{ x: number; y: number }> | null;
  flow?: {
    on: boolean;
    dir?: 1 | -1;
    strength?: number;
  };
};

type PortSide = "in" | "out";
type PortHit = { nodeId: string; side: PortSide; portId: string; x: number; y: number };

/** =========================
 *  Constantes
 *  ========================= */

const TOPBAR_H = 44;
const ZOOM_MAX = 20;
const MAPA_URL = "https://www.diracserviciosenergia.com/mapa";

const VIEWBOX_DEFAULT = { minx: 0, miny: 0, w: 1000, h: 520 };
const MAX_VIEWBOX_W = 6000;
const MAX_VIEWBOX_H = 3500;

/** =========================
 *  Helpers (fuera del componente)
 *  ========================= */

function spreadOffsets(count: number, span: number) {
  if (count <= 1) return [0];
  const step = span / (count - 1);
  const start = -span / 2;
  return Array.from({ length: count }, (_, i) => start + i * step);
}

function getCompanyIdFromQuery(): number | null {
  const qs = new URLSearchParams(window.location.search);
  const raw = qs.get("company_id");
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const v = Number(trimmed);
  if (!Number.isFinite(v) || v <= 0) return null;
  return v;
}

function isDebugEnabled(): boolean {
  return false;
}

function summarizeTypes(rows: Array<{ type?: string } | any> | undefined) {
  const out: Record<string, number> = {};
  for (const r of rows || []) {
    const t = String((r as any).type ?? "").toLowerCase() || "unknown";
    out[t] = (out[t] ?? 0) + 1;
  }
  return out;
}

function halfByType(t?: string) {
  const tt = (t || "").toLowerCase();
  if (tt === "tank") return 145;
  if (tt === "pump") return 30;
  if (tt === "manifold") return 55;
  if (tt === "valve") return 14;
  return 20;
}

function heightByType(t?: string) {
  const tt = (t || "").toLowerCase();
  if (tt === "tank") return 210;
  if (tt === "pump") return 60;
  if (tt === "manifold") return 74;
  if (tt === "valve") return 28;
  return 40;
}

function getNodePorts(n: UINode): { ins: string[]; outs: string[] } {
  const p = getPortsByType(n.type);
  return {
    ins: (p.in ?? []) as string[],
    outs: (p.out ?? []) as string[],
  };
}

function buildPorts(n: UINode) {
  const { ins, outs } = getNodePorts(n);

  if (n.type === "tank") {
    const isWell = (n as any).categoria === "pozo";

    if (isWell) {
      /*
       * POZO ANCHO
       * Casing visual aproximado: 300 px.
       *
       * Los puertos laterales quedan ADENTRO del cuerpo:
       * - dos a la izquierda
       * - dos a la derecha
       *
       * Esto permite ubicar hasta dos bombas por lado.
       */
      const insideX = 140;

      const pos: Record<string, { x: number; y: number }> = {
        L1: { x: n.x - insideX, y: n.y - 52 },
        L2: { x: n.x - insideX, y: n.y + 52 },
        L3: { x: n.x - insideX, y: n.y },

        R1: { x: n.x + insideX, y: n.y - 52 },
        R2: { x: n.x + insideX, y: n.y + 52 },
        R3: { x: n.x + insideX, y: n.y },

        T1: { x: n.x - 75, y: n.y - 105 },
        T2: { x: n.x,      y: n.y - 105 },
        T3: { x: n.x + 75, y: n.y - 105 },

        B1: { x: n.x - 75, y: n.y + 105 },
        B2: { x: n.x,      y: n.y + 105 },
        B3: { x: n.x + 75, y: n.y + 105 },
      };

      return {
        inPorts: ins.map((id) => ({
          portId: id,
          side: "in" as const,
          ...(pos[id] ?? { x: n.x - insideX, y: n.y }),
        })),
        outPorts: outs.map((id) => ({
          portId: id,
          side: "out" as const,
          ...(pos[id] ?? { x: n.x + insideX, y: n.y }),
        })),
      };
    }

    // TANQUE NORMAL
    //
    // Cuerpo visual:
    //   ancho aprox. 256 px
    //   alto aprox. 144 px
    //
    // Los puntos quedan metidos dentro del cuerpo para que la
    // cañería parezca nacer desde el tanque y no desde afuera.
    const insideX = 118;
    const insideY = 82;

    const pos: Record<string, { x: number; y: number }> = {
      // Laterales: 3 puntos por lado, todos dentro del cuerpo
      L1: { x: n.x - insideX, y: n.y - 42 },
      L2: { x: n.x - insideX, y: n.y },
      L3: { x: n.x - insideX, y: n.y + 42 },

      R1: { x: n.x + insideX, y: n.y - 42 },
      R2: { x: n.x + insideX, y: n.y },
      R3: { x: n.x + insideX, y: n.y + 42 },

      // Superior e inferior también levemente adentro
      T1: { x: n.x - 65, y: n.y - insideY },
      T2: { x: n.x,      y: n.y - insideY },
      T3: { x: n.x + 65, y: n.y - insideY },

      B1: { x: n.x - 65, y: n.y + insideY },
      B2: { x: n.x,      y: n.y + insideY },
      B3: { x: n.x + 65, y: n.y + insideY },
    };

    return {
      inPorts: ins.map((id) => ({
        portId: id,
        side: "in" as const,
        ...(pos[id] ?? { x: n.x - insideX, y: n.y }),
      })),
      outPorts: outs.map((id) => ({
        portId: id,
        side: "out" as const,
        ...(pos[id] ?? { x: n.x + insideX, y: n.y }),
      })),
    };
  }
  const off = 6;
  const half = halfByType(n.type);
  const h = heightByType(n.type);
  const span = Math.max(18, h * 0.6);

  const inOffs = spreadOffsets(ins.length, span);
  const outOffs = spreadOffsets(outs.length, span);

  const inPorts = ins.map((id, idx) => ({
    portId: id,
    side: "in" as const,
    x: n.x - half - off,
    y: n.y + inOffs[idx],
  }));

  const outPorts = outs.map((id, idx) => ({
    portId: id,
    side: "out" as const,
    x: n.x + half + off,
    y: n.y + outOffs[idx],
  }));

  return { inPorts, outPorts };
}
/** =========================
 *  FLOW SIM (simple, dirigido)
 *  ========================= */

function isPumpOn(n: UINode) {
  if (n.type !== "pump") return false;
  const s = String((n as any).state ?? "").trim().toLowerCase();
  return s === "run" || s === "running" || s === "on" || s === "1" || s === "true";
}

function isValveOpen(n: UINode) {
  const s = String((n as any).state ?? "").toLowerCase();
  return s === "open" || s === "on" || s === "1" || s === "true";
}

function isNodePassable(n: UINode) {
  if (n.type === "manifold") return true;
  if (n.online === false) return false;
  return true;
}

function simulateFlow(edges: UIEdgeWithPorts[], nodesById: Record<string, UINode>) {
  const adj: Record<string, UIEdgeWithPorts[]> = {};
  for (const e of edges) (adj[e.a] ||= []).push(e);

  const seeds = Object.values(nodesById).filter(isPumpOn);

  const visitedNode = new Set<string>();
  const flowOnEdge = new Set<number>();
  const q: string[] = [];

  for (const p of seeds) {
    visitedNode.add(p.id);
    q.push(p.id);
  }

  while (q.length) {
    const cur = q.shift()!;
    const curNode = nodesById[cur];
    if (!curNode) continue;

    if (!isNodePassable(curNode)) continue;

    const outEdges = adj[cur] || [];
    for (const e of outEdges) {
      const nextId = e.b;
      const nextNode = nodesById[nextId];
      if (!nextNode) continue;

      if (!isNodePassable(nextNode)) continue;

      flowOnEdge.add(e.id);

      if (!visitedNode.has(nextId)) {
        visitedNode.add(nextId);
        q.push(nextId);
      }
    }
  }

  return edges.map((e) => ({
    ...e,
    flow: {
      on: flowOnEdge.has(e.id),
      dir: 1,
      strength: flowOnEdge.has(e.id) ? 1 : 0,
    },
  }));
}

/** =========================
 *  Component
 *  ========================= */

export default function InfraDiagram() {
  const DEBUG = useMemo(() => isDebugEnabled(), []);
  const log = useCallback(
    (...args: any[]) => {
    },
    [DEBUG]
  );

  const companyId = useMemo(() => getCompanyIdFromQuery(), []);

  useEffect(() => {
    log("href:", window.location.href);
    log("companyId from query:", companyId);
  }, [companyId, log]);

  const [pumpPipeTaps, setPumpPipeTaps] = useState<PumpPipeTap[]>([]);
  const [pumpTapFrom, setPumpTapFrom] = useState<string | null>(null);
  const [nodes, setNodes] = useState<UINode[]>([]);
  const [edges, setEdges] = useState<UIEdgeWithPorts[]>([]);

  const [viewBoxStr, setViewBoxStr] = useState(
    `${VIEWBOX_DEFAULT.minx} ${VIEWBOX_DEFAULT.miny} ${VIEWBOX_DEFAULT.w} ${VIEWBOX_DEFAULT.h}`
  );
  const [vb, setVb] = useState(VIEWBOX_DEFAULT);

  const [editMode, setEditMode] = useState(false);
  const [connectMode, setConnectMode] = useState(false);
  const [activeServicio, setActiveServicio] = useState<ServicioSCADA>("agua");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedPumpAvailability, setSelectedPumpAvailability] = useState<PumpAvailability | null>(null);
  const [savingPumpAvailability, setSavingPumpAvailability] = useState(false);
  const [selectedEdgeId, setSelectedEdgeId] = useState<number | null>(null);

  const [connectFrom, setConnectFrom] = useState<PortHit | null>(null);
  const [mouseSvg, setMouseSvg] = useState<{ x: number; y: number } | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const [opsOpen, setOpsOpen] = useState(false);
  const [opsNode, setOpsNode] = useState<UINode | null>(null);

  const [locationDrawerOpen, setLocationDrawerOpen] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<{ id: number | null; name: string } | null>(null);

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [tip, setTip] = useState<Tip | null>(null);

  const showTip = useCallback((e: React.MouseEvent, content: { title: string; lines: string[] }) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    setTip({
      title: content.title,
      lines: content.lines,
      x: e.clientX - rect.left + 12,
      y: e.clientY - rect.top + 12,
    });
  }, []);

  const hideTip = useCallback(() => setTip(null), []);

  const goToMapa = useCallback(() => {
    try {
      const w: any = window;
      const topWin = w.top || w;
      topWin.location.href = MAPA_URL;
    } catch {
      window.open(MAPA_URL, "_blank", "noopener,noreferrer");
    }
  }, []);

  const { data, isFetching, error } = useLiveQuery(
    ["infra", "layout", companyId],
    async (signal) => {
      const qs = companyId ? `?company_id=${companyId}` : "";
      const urlNodes = `/infraestructura/get_layout_combined${qs}`;
      const urlEdges = `/infraestructura/get_layout_edges${qs}`;

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

  useEffect(() => {
    if (!data) return;

    let uiNodes: UINode[] = (data.nodesRaw ?? []).map((n) => ({
      id: n.node_id,
      type: n.type,
      name:
        typeof (n as any).name === "string" && (n as any).name.trim()
          ? (n as any).name.trim()
          : `${n.type} ${n.id}`,
      x: numberOr(n.x, 0),
      y: numberOr(n.y, 0),
      online: n.online ?? null,
      state: n.state ?? null,
      level_pct: toNumber(n.level_pct),
      alarma: n.alarma ?? null,
      categoria: (n as any).categoria ?? null,
      in_maintenance: (n as any).in_maintenance ?? false,
      orientacion: (n as any).orientacion ?? null,
      servicio: (n as any).servicio ?? "agua",
      location_id: (n as any).location_id ?? null,
      location_name: (n as any).location_name ?? null,

      ...(n.type === "manifold" ? { signals: (n as any).signals ?? null } : {}),

      ...(n.type === "network_analyzer"
        ? (() => {
            const aid = Number((n as any).analyzer_id ?? n.id);
            return {
              signals: (n as any).signals ?? null,
              analyzer_id: Number.isFinite(aid) ? aid : null,
            };
          })()
        : {}),

      ...(n.type === "valve" ? { meta: (n as any).meta ?? null } : {}),
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

    const uiEdges: UIEdgeWithPorts[] = (data.edgesRaw ?? []).map((e: any) => ({
      id: e.edge_id,
      a: e.src_node_id,
      b: e.dst_node_id,
      relacion: e.relacion,
      prioridad: e.prioridad,
      a_port: e.src_port ?? "R1",
      b_port: e.dst_port ?? "L1",
      knots: Array.isArray(e.knots) ? e.knots : [],
    }));

    setNodes(uiNodes);
    setEdges(uiEdges);

    log("UI NODES", {
      total: uiNodes.length,
      byType: summarizeTypes(uiNodes.map((n) => ({ type: n.type }) as any)),
    });
    log("UI EDGES", { total: uiEdges.length });
  }, [data, log]);

  const nodesById = useMemo(() => {
    const m: Record<string, UINode> = {};
    for (const n of nodes) {
      if (Number.isFinite(n.x) && Number.isFinite(n.y)) m[n.id] = n;
    }
    return m;
  }, [nodes]);

  useEffect(() => {
    if (!nodes.length) return;

    const pad = 240;
    const bb = computeBBox(nodes, pad);

    const safe = {
      minx: bb.minx,
      miny: bb.miny,
      w: Math.min(bb.w, MAX_VIEWBOX_W),
      h: Math.min(bb.h, MAX_VIEWBOX_H),
    };

    setVb(safe);
    setViewBoxStr(`${safe.minx} ${safe.miny} ${safe.w} ${safe.h}`);
  }, [nodes]);

  const locationGroups: LocationGroup[] = useMemo(() => {
    if (!nodes.length) return [];

    const groups: Record<string, { key: string; name: string; nodes: UINode[]; location_id: number | null }> = {};

    for (const n of nodes) {
      const key =
        n.location_id != null ? String(n.location_id) : n.location_name ? `name:${n.location_name}` : "unknown";

      const locName = n.location_name || (n.location_id != null ? `Ubicación ${n.location_id}` : "Sin ubicación");

      if (!groups[key]) {
        groups[key] = { key, name: locName, nodes: [], location_id: n.location_id ?? null };
      }
      groups[key].nodes.push(n);
    }

    return Object.values(groups)
      .filter((g) => g.nodes.length > 0)
      .map((g) => {
        const bbox = computeBBox(g.nodes, 48);
        return { key: g.key, name: g.name, bbox, location_id: g.location_id };
      });
  }, [nodes]);

  const getPos = useCallback(
    (id: string) => {
      const n = nodesById[id];
      return n ? { x: n.x, y: n.y } : null;
    },
    [nodesById]
  );

  const setPos = useCallback((id: string, x: number, y: number) => {
    setNodes((prev) => prev.map((n) => (n.id === id ? { ...n, x, y } : n)));
  }, []);

  const saveNodePosition = useCallback(
    async (id: string) => {
      try {
        const pos = getPos(id);
        if (!pos) return;

        saveLayoutToStorage(nodesByIdAsArray(nodesById));
        await updateLayout(id, pos.x, pos.y);

        log("POSITION SAVED", { id, x: pos.x, y: pos.y });
      } catch (e) {
        console.error("Error al actualizar layout:", e);
      }
    },
    [getPos, nodesById, log]
  );

  const saveNodePositionXY = useCallback(
    async (id: string, x: number, y: number) => {
      try {
        const next = nodesByIdAsArray({
          ...nodesById,
          [id]: { ...(nodesById[id] as any), x, y },
        } as any);
        saveLayoutToStorage(next);

        await updateLayout(id, x, y);
        log("POSITION SAVED (XY)", { id, x, y });
      } catch (e) {
        console.error("Error al actualizar layout (XY):", e);
      }
    },
    [nodesById, log]
  );

  const refreshPumpPipeTaps = useCallback(async () => { try { setPumpPipeTaps(await getPumpPipeTaps()); } catch (err) { console.error(err); } }, []);
  useEffect(() => { refreshPumpPipeTaps(); }, [refreshPumpPipeTaps]);
  const handlePumpTapSelect = useCallback((nodeId: string) => {
    if (!editMode || !connectMode) return;
    setPumpTapFrom(nodeId);
    setConnectFrom(null);
    setMouseSvg(null);
    setSelectedEdgeId(null);
  }, [editMode, connectMode]);

  const handlePumpTapPipeClick = useCallback(async (edgeId: number, x: number, y: number) => {
    if (!pumpTapFrom) return;
    const pumpNode = nodesById[pumpTapFrom];
    if (!pumpNode || pumpNode.type !== "pump") return;

    const inject = window.confirm("Aceptar = INYECTA a la cañería\nCancelar = EXTRAE de la cañería");
    const mode: PumpPipeTapMode = inject ? "inject" : "extract";
    const pumpId = Number(String(pumpNode.id).split(":").pop());
    if (!Number.isFinite(pumpId)) return;

    try {
      await savePumpPipeTap({ pump_id: pumpId, edge_id: edgeId, mode, x, y, t: 0.5 });
      await refreshPumpPipeTaps();
      setPumpTapFrom(null);
      setConnectFrom(null);
      setMouseSvg(null);
      setSelectedEdgeId(null);
    } catch (err: any) {
      console.error(err);
      alert(err?.message || "No se pudo guardar la conexión bomba-cañería");
    }
  }, [pumpTapFrom, nodesById, refreshPumpPipeTaps]);

  const toggleEdit = useCallback(() => {
    setEditMode((prev) => {
      const next = !prev;
      if (!next) {
        setConnectMode(false);
        setPumpTapFrom(null);
        setConnectFrom(null);
        setSelectedEdgeId(null);
        setSelectedNodeId(null);
      }
      return next;
    });
  }, []);

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

  const edgeExists = useCallback((src: string, dst: string) => edges.some((e) => e.a === src && e.b === dst), [edges]);

  const tryCreateEdge = useCallback(
    async (src: string, dst: string, a_port?: string | null, b_port?: string | null) => {
      if (src === dst || edgeExists(src, dst)) return;
      try {
        const created = await apiCreateEdge({ src_node_id: src, dst_node_id: dst });
        setEdges((prev) => [
          {
            id: created.edge_id,
            a: created.src_node_id,
            b: created.dst_node_id,
            relacion: created.relacion,
            prioridad: created.prioridad,
            a_port: (created as any).src_port ?? a_port ?? "R1",
            b_port: (created as any).dst_port ?? b_port ?? "L1",
          },
          ...prev,
        ]);
        log("EDGE CREATED", { id: created.edge_id, src: created.src_node_id, dst: created.dst_node_id });
      } catch (err: any) {
        console.error(err);
        alert(err?.message || "No se pudo crear la conexión");
      }
    },
    [edgeExists, log]
  );

  const handleDeleteEdge = useCallback(
    async (edgeId: number) => {
      try {
        await apiDeleteEdge(edgeId);
        setEdges((prev) => prev.filter((e) => e.id !== edgeId));
        setSelectedEdgeId(null);
        log("EDGE DELETED", { edgeId });
      } catch (err: any) {
        console.error(err);
        alert(err?.message || "No se pudo borrar la conexión");
      }
    },
    [log]
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setConnectFrom(null);
        setSelectedEdgeId(null);
        setOpsOpen(false);
        /* LocationDrawer desactivado */
        setSelectedLocation(null);
      } else if ((e.key === "Delete" || e.key === "Backspace") && selectedEdgeId != null && editMode) {
        e.preventDefault();
        handleDeleteEdge(selectedEdgeId);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [editMode, selectedEdgeId, handleDeleteEdge]);

  const applyAutoLayout = useCallback(async () => {
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
  }, [nodes, log]);

  const previewPath = useCallback((sx: number, sy: number, ex: number, ey: number) => {
    const mx = (sx + ex) / 2;
    return `M ${sx} ${sy} L ${mx} ${sy} L ${mx} ${ey} L ${ex} ${ey}`;
  }, []);

  const maybeOpenOps = useCallback(
    (n: UINode) => {
      if (editMode || connectMode) return;
      if (n.online !== true) return;
      setOpsNode(n);
      setOpsOpen(true);
    },
    [editMode, connectMode]
  );

  const handleLocationClick = useCallback((g: LocationGroup) => {
    setSelectedLocation({ id: g.location_id, name: g.name });
    /* LocationDrawer desactivado */
  }, []);

  const valveNodeIds = useMemo(
    () => new Set(nodes.filter((n) => n.type === "valve").map((n) => n.id)),
    [nodes]
  );

  const visibleNodes = useMemo(
    () =>
      nodes.filter((n) => {
        if (n.type === "valve") return false;
        if (activeServicio === "todos") return true;
        return ((n as any).servicio ?? "agua") === activeServicio;
      }),
    [nodes, activeServicio]
  );

  const visibleNodeIds = useMemo(
    () => new Set(visibleNodes.map((n) => n.id)),
    [visibleNodes]
  );

  const selectedNode = selectedNodeId ? nodesById[selectedNodeId] : null;
  // V18.7 PUMP AVAILABILITY
  useEffect(() => {
    let cancelled = false;

    if (!selectedNode || selectedNode.type !== "pump") {
      setSelectedPumpAvailability(null);
      return;
    }

    const pumpId = Number(String(selectedNode.id).split(":").pop());
    if (!Number.isFinite(pumpId)) {
      setSelectedPumpAvailability(null);
      return;
    }

    getPumpAvailability(pumpId)
      .then((row) => {
        if (!cancelled) setSelectedPumpAvailability(row);
      })
      .catch((err) => {
        if (!cancelled) {
          setSelectedPumpAvailability(null);
          // 404 = bomba secundaria/no principal. No mostramos botÃ³n.
          if (!String(err?.message || "").includes("404")) {
            console.error("No se pudo leer disponibilidad de bomba:", err);
          }
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedNodeId, selectedNode?.id, selectedNode?.type]);

  const toggleSelectedPumpAvailability = useCallback(async () => {
    if (!selectedPumpAvailability || savingPumpAvailability) return;

    try {
      setSavingPumpAvailability(true);
      const saved = await savePumpAvailability(
        selectedPumpAvailability.id,
        !selectedPumpAvailability.disponible
      );
      setSelectedPumpAvailability(saved);
    } catch (err: any) {
      console.error(err);
      alert(err?.message || "No se pudo actualizar disponibilidad");
    } finally {
      setSavingPumpAvailability(false);
    }
  }, [selectedPumpAvailability, savingPumpAvailability]);




  const pumpTapByEdge = useMemo(() => { const m=new Map<number,PumpPipeTap[]>(); for(const tap of pumpPipeTaps){const a=m.get(tap.edge_id)??[];a.push(tap);m.set(tap.edge_id,a);} return m; },[pumpPipeTaps]);

  const edgesForRender: UIEdgeWithPorts[] = useMemo(() => {
    const base=simulateFlow(edges,nodesById).filter((e)=>nodesById[e.a]?.type!=="pump"&&nodesById[e.b]?.type!=="pump");
    return base.map((e)=>{ const taps=pumpTapByEdge.get(e.id)??[]; const active=taps.find((tap)=>{const p=nodesById[tap.pump_node_id];return !!p&&isPumpOn(p);}); if(!active)return e; return {...e,flow:{on:true,dir:active.mode==="inject"?1:-1,strength:1}}; });
  }, [edges, nodesById, pumpTapByEdge]);

  return (
    <div style={{ width: "100%", padding: 0 }}>
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
        {error && (<span style={{ color: "#b91c1c" }}>Error: {(error as Error)?.message || "Error desconocido"}</span>)}

        <div
          style={{
            display: "flex",
            gap: 6,
            marginLeft: 14,
            padding: 3,
            borderRadius: 10,
            background: "#eef2f7",
          }}
        >
          {([
            ["agua", "Agua"],
            ["cargaderos", "Cargaderos de agua"],
            ["cloacas", "Cloacas"],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              onClick={() => {
                setActiveServicio(id);
                setSelectedNodeId(null);
              }}
              style={{
                padding: "5px 10px",
                borderRadius: 8,
                border: "none",
                background: activeServicio === id ? "#0f172a" : "transparent",
                color: activeServicio === id ? "#ffffff" : "#475569",
                fontWeight: 800,
                fontSize: 11,
                cursor: "pointer",
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {editMode && selectedNode && ["tank", "pump"].includes(selectedNode.type) && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: "#64748b" }}>
              Grupo:
            </span>
            <select
              value={((selectedNode as any).servicio ?? "agua") as ServicioSCADA}
              onChange={async (e) => {
                const servicio = e.target.value as ServicioSCADA;
                try {
                  await saveNodeServicio(selectedNode.id, servicio);
                  setNodes((prev) =>
                    prev.map((node) =>
                      node.id === selectedNode.id
                        ? ({ ...node, servicio } as any)
                        : node
                    )
                  );
                } catch (err: any) {
                  console.error(err);
                  alert(err?.message || "No se pudo cambiar el grupo");
                }
              }}
              style={{
                height: 28,
                borderRadius: 7,
                border: "1px solid #cbd5e1",
                background: "#ffffff",
                color: "#0f172a",
                fontSize: 11,
                fontWeight: 800,
                padding: "0 8px",
              }}
            >
              <option value="agua">Agua</option>
              <option value="cargaderos">Cargaderos de agua</option>
              <option value="cloacas">Cloacas</option>
            </select>
          </div>
        )}

        {/* V18.7 DISPONIBILIDAD IMPULSION */}
        {editMode &&
          selectedNode?.type === "pump" &&
          selectedPumpAvailability?.rol_red === "impulsion_principal" && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 7,
                marginLeft: 8,
                padding: "3px 7px",
                borderRadius: 9,
                border: "1px solid #cbd5e1",
                background: "#ffffff",
              }}
            >
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 900,
                  color: "#64748b",
                  textTransform: "uppercase",
                  letterSpacing: 0.4,
                }}
              >
                ImpulsiÃ³n
              </span>

              <button
                type="button"
                disabled={savingPumpAvailability}
                onClick={toggleSelectedPumpAvailability}
                title="Cambiar disponibilidad operativa de esta bomba"
                style={{
                  height: 26,
                  padding: "0 10px",
                  borderRadius: 999,
                  border: selectedPumpAvailability.disponible
                    ? "1px solid #86efac"
                    : "1px solid #fecaca",
                  background: selectedPumpAvailability.disponible
                    ? "#dcfce7"
                    : "#fee2e2",
                  color: selectedPumpAvailability.disponible
                    ? "#166534"
                    : "#b91c1c",
                  fontSize: 10,
                  fontWeight: 900,
                  cursor: savingPumpAvailability ? "wait" : "pointer",
                  opacity: savingPumpAvailability ? 0.65 : 1,
                }}
              >
                {savingPumpAvailability
                  ? "Guardando..."
                  : selectedPumpAvailability.disponible
                  ? "Disponible"
                  : "No disponible"}
              </button>
            </div>
          )}
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
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

      {!error && (
        <div
          ref={wrapRef}
          style={{
            position: "relative",
            border: "none",
            borderRadius: 0,
            overflow: "hidden",
            background: "#ffffff",
            width: "100%",
            height: `calc(100vh - ${TOPBAR_H}px)`,
            boxSizing: "border-box",
          }}
        >
          <TransformWrapper initialScale={1} minScale={0.35} maxScale={ZOOM_MAX} centerOnInit wheel={{ step: 0.1 }}>
            <TransformComponent wrapperStyle={{ width: "100%", height: "100%", background: "#ffffff" }} contentStyle={{ width: "100%", height: "100%" }}>
              <svg
                ref={svgRef}
                width="100%"
                height="100%"
                viewBox={viewBoxStr}
                preserveAspectRatio="xMidYMid meet"
                style={{ display: "block", width: "100%", height: "100%", background: "#ffffff" }}
                onMouseMove={(e) => {
                  if (!connectFrom) return;
                  const p = clientToSvgPoint(e);
                  if (p) setMouseSvg(p);
                }}
                onMouseDown={(e) => {
                  if (!editMode) return;
                  if (e.target === e.currentTarget) setSelectedEdgeId(null);
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
                <rect x={vb.minx} y={vb.miny} width={vb.w} height={vb.h} fill="url(#grid)" opacity={0.012} />

                {/* Localidades visuales eliminadas: sin fondos ni títulos. */}

                {edgesForRender.filter((e) => visibleNodeIds.has(e.a) && visibleNodeIds.has(e.b)).map((e) => (
                  <EditableEdge
                    key={`edge-${e.id}`}
                    id={e.id}
                    a={e.a}
                    b={e.b}
                    nodesById={nodesById}
                    editable={editMode}
                    selected={selectedEdgeId === e.id}
                    onSelect={(id) => setSelectedEdgeId(id)}
                    a_port={e.a_port as any}
                    b_port={e.b_port as any}
                    flow={e.flow}
                    knots={e.knots ?? []}
                    tapConnectMode={editMode && connectMode && !!pumpTapFrom}
                    onTapPipeClick={handlePumpTapPipeClick}
                  />
                ))}

                {pumpPipeTaps.map((tap) => (
                  <PumpPipeTapView
                    key={`pump-tap-${tap.id}`}
                    tap={tap}
                    pump={visibleNodeIds.has(tap.pump_node_id) ? nodesById[tap.pump_node_id] : undefined}
                    visiblePoint={editMode && connectMode}
                  />
                ))}

                {[...visibleNodes]
                  .sort((a, b) => {
                    const za = a.type === "network_analyzer" ? 1 : 0;
                    const zb = b.type === "network_analyzer" ? 1 : 0;
                    return za - zb;
                  })
                  .map((n) =>
                  n.type === "tank" ? (
                    <TankNodeView
                      key={n.id}
                      n={n as TankNode}
                      getPos={getPos}
                      setPos={setPos}
                      onDragEnd={() => saveNodePosition(n.id)}
                      showTip={showTip}
                      hideTip={hideTip}
                      enabled={editMode && !connectMode}
                      onClick={() => {
                        if (editMode && !connectMode) {
                          setSelectedNodeId(n.id);
                          return;
                        }
                        if (!editMode && !connectMode) maybeOpenOps(n);
                      }}
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
                      enabled={editMode && !connectMode}
                      tapConnectMode={editMode && connectMode}
                      tapSelected={pumpTapFrom === n.id}
                      onTapSelect={handlePumpTapSelect}
                      onClick={() => {
                        if (editMode && !connectMode) {
                          setSelectedNodeId(n.id);
                          return;
                        }
                        if (!editMode && !connectMode) maybeOpenOps(n);
                      }}
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
                      enabled={editMode && !connectMode}
                      onClick={() => (!editMode && !connectMode ? maybeOpenOps(n) : undefined)}
                    />
                  ) : n.type === "network_analyzer" ? (
                    <NetworkAnalyzerNodeView
                      key={n.id}
                      n={n as any}
                      getPos={getPos}
                      setPos={setPos}
                      onDragEnd={(x, y) => saveNodePositionXY(n.id, x, y)}
                      showTip={showTip}
                      hideTip={hideTip}
                      enabled={editMode && !connectMode}
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
                      enabled={editMode && !connectMode}
                      onClick={() => (!editMode && !connectMode ? maybeOpenOps(n) : undefined)}
                    />
                  ) : null
                )}

                {editMode &&
                  connectMode &&
                  visibleNodes.filter((n) => n.type !== "pump").map((n) => {
                    const { inPorts, outPorts } = buildPorts(n);
                    return (
                      <g key={`ports-${n.id}`}>
                        {inPorts.map((p) => (
                          <circle
                            key={`in-${n.id}-${p.portId}`}
                            cx={p.x}
                            cy={p.y}
                            r={5}
                            fill="#ffffff"
                            stroke="#64748b"
                            strokeWidth={1.6}
                            onMouseUp={() => {
                              if (connectFrom && connectFrom.side === "out") {
                                tryCreateEdge(connectFrom.nodeId, n.id, connectFrom.portId, p.portId);
                                setConnectFrom(null);
                                setMouseSvg(null);
                              }
                            }}
                          />
                        ))}

                        {outPorts.map((p) => (
                          <circle
                            key={`out-${n.id}-${p.portId}`}
                            cx={p.x}
                            cy={p.y}
                            r={5}
                            fill="#ffffff"
                            stroke="#0ea5e9"
                            strokeWidth={1.8}
                            onMouseDown={(e) => {
                              e.stopPropagation();
                              setSelectedEdgeId(null);
                              setOpsOpen(false);
                              /* LocationDrawer desactivado */
                              setConnectFrom({ nodeId: n.id, side: "out", portId: p.portId, x: p.x, y: p.y });
                              const pt = clientToSvgPoint(e);
                              if (pt) setMouseSvg(pt);
                            }}
                          />
                        ))}
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
          /* LocationDrawer desactivado */
          setSelectedLocation(null);
        }}
        location={selectedLocation}
      />
    </div>
  );
}





















