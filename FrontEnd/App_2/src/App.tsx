import React, { useEffect, useMemo, useRef, useState } from "react";
import Edge from "@/components/diagram/Edge";
import useDragNode from "@/hooks/useDragNode";
import {
  loadLayoutFromStorage,
  saveLayoutToStorage,
  importLayout as importLayoutLS,
} from "@/layout/layoutIO";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";

// ==============================
// Configuración de API
// ==============================
const API_BASE =
  (import.meta as any)?.env?.VITE_API_BASE?.replace(/\/+$/, "") ||
  "https://diracinstrumentacion.onrender.com";

async function fetchJSON<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} ${res.statusText} - ${txt}`);
  }
  return res.json();
}

/** POST para actualizar coordenadas de un nodo */
async function updateLayout(node_id: string, x: number, y: number) {
  const res = await fetch(`${API_BASE}/infraestructura/update_layout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ node_id, x, y }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Update layout: HTTP ${res.status} ${res.statusText} - ${txt}`);
  }
  return res.json();
}

// ==============================
// Tipos backend
// ==============================
type CombinedNodeDTO = {
  node_id: string;
  id: number;
  type: "pump" | "tank" | "manifold" | "valve";
  x: number | null;
  y: number | null;
  updated_at: string | null;
  online: boolean | null;
  state?: string | null;
  level_pct?: number | string | null;
  alarma?: string | null;
};

type EdgeDTO = {
  edge_id: number;
  src_node_id: string;
  dst_node_id: string;
  relacion: string;
  prioridad: number;
  updated_at: string;
};

// ==============================
// Tipos UI
// ==============================
type BaseExtras = {
  online?: boolean | null;
  state?: string | null;
  level_pct?: number | null;
  alarma?: string | null;
};

type UINodeBase = {
  id: string; // = node_id
  name: string;
  x: number;
  y: number;
  type: "pump" | "tank" | "manifold" | "valve";
} & BaseExtras;

type TankNode = UINodeBase & { type: "tank" };
type PumpNode = UINodeBase & { type: "pump" };
type ManifoldNode = UINodeBase & { type: "manifold" };
type ValveNode = UINodeBase & { type: "valve" };
type UINode = TankNode | PumpNode | ManifoldNode | ValveNode;

type UIEdge = {
  a: string; // src node_id
  b: string; // dst node_id
  relacion?: string;
  prioridad?: number;
};

// ==============================
// Helpers layout
// ==============================
const isSet = (v?: number | null) => Number.isFinite(v) && Math.abs((v as number)) > 1;

function numberOr<T extends number | null | undefined>(v: T, fb: number): number {
  return isSet(v as number) ? (v as number) : fb;
}

function layoutRow<T extends UINode>(
  nodes: T[],
  { startX = 140, startY = 380, gapX = 160 }: { startX?: number; startY?: number; gapX?: number } = {}
): T[] {
  return nodes.map((n, i) => {
    const xOk = isSet(n.x);
    const yOk = isSet(n.y);
    return {
      ...n,
      x: xOk ? (n.x as number) : startX + i * gapX,
      y: yOk ? (n.y as number) : startY,
    };
  });
}

function nodesByIdAsArray(map: Record<string, UINode>) {
  return Object.values(map);
}

function toNumber(val: any): number | null {
  if (val === null || val === undefined) return null;
  const n = Number(val);
  return Number.isFinite(n) ? n : null;
}

/** BBox para viewBox auto */
function computeBBox(nodes: { x: number; y: number }[], pad = 60) {
  if (!nodes.length) return { minx: 0, miny: 0, w: 1000, h: 520 };
  const xs = nodes.map((n) => n.x);
  const ys = nodes.map((n) => n.y);
  const minx = Math.min(...xs) - pad;
  const miny = Math.min(...ys) - pad;
  const maxx = Math.max(...xs) + pad;
  const maxy = Math.max(...ys) + pad;
  return { minx, miny, w: Math.max(1, maxx - minx), h: Math.max(1, maxy - miny) };
}

// ==============================
// Drag helper común
// ==============================
function useNodeDragCommon(n: UINode, getPos: any, setPos: any, onDragEnd: () => void, onAnyPointer?: () => void) {
  return useDragNode({
    id: n.id,
    enabled: true,
    snap: 10,
    getPos,
    setPos,
    onEnd: onDragEnd,
    onChange: onAnyPointer,
  } as any);
}

// ==============================
// Tooltip
// ==============================
type Tip = { title: string; lines: string[]; x: number; y: number };
function Tooltip({ tip }: { tip: Tip | null }) {
  if (!tip) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: tip.x,
        top: tip.y,
        transform: "translateY(-110%)",
        background: "#ffffff",
        border: "1px solid #e2e8f0",
        borderRadius: 10,
        padding: "8px 10px",
        fontSize: 12,
        color: "#0f172a",
        boxShadow: "0 10px 20px rgba(2,6,23,0.08)",
        pointerEvents: "none",
        minWidth: 160,
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{tip.title}</div>
      {tip.lines.map((l, i) => (
        <div key={i} style={{ color: "#475569" }}>
          {l}
        </div>
      ))}
    </div>
  );
}

// ==============================
// Nodos (views)
// ==============================
function TankNodeView({
  n,
  getPos,
  setPos,
  onDragEnd,
  showTip,
  hideTip,
  wrapperRect,
}: {
  n: TankNode;
  getPos: any;
  setPos: any;
  onDragEnd: () => void;
  showTip: (e: React.MouseEvent, content: { title: string; lines: string[] }) => void;
  hideTip: () => void;
  wrapperRect: DOMRect | null;
}) {
  const drag = useNodeDragCommon(n, getPos, setPos, onDragEnd, hideTip);

  const W = 132;
  const H = 100;
  const P = 12;
  const innerW = W - 2 * P;
  const innerH = H - 2 * P;

  const isOnline = n.online === true;
  const alarma = (n.alarma || "").toLowerCase();
  const stroke = alarma === "critico" ? "#ef4444" : "#3b82f6";
  const levelRaw = typeof n.level_pct === "number" ? n.level_pct : toNumber(n.level_pct);
  const level = Math.max(0, Math.min(100, levelRaw ?? 0));
  const levelY = P + innerH - (level / 100) * innerH;
  const groupOpacity = isOnline ? 1 : 0.55;

  const clipId = `clip-${n.id}`;

  const tipLines = [
    `Online: ${isOnline ? "Sí" : "No"}`,
    `Nivel: ${levelRaw != null ? `${level}%` : "—"}`,
    `Alarma: ${n.alarma ?? "—"}`,
  ];

  return (
    <g
      transform={`translate(${n.x - W / 2}, ${n.y - H / 2})`}
      onPointerDown={drag.onPointerDown}
      onPointerMove={drag.onPointerMove}
      onPointerUp={drag.onPointerUp}
      onMouseEnter={(e) => showTip(e, { title: n.name, lines: tipLines })}
      onMouseMove={(e) => showTip(e, { title: n.name, lines: tipLines })}
      onMouseLeave={hideTip}
      className="node-shadow"
      style={{ cursor: "move" }}
      opacity={groupOpacity}
    >
      <defs>
        <clipPath id={clipId}>
          <rect x={P} y={P} width={innerW} height={innerH} rx={12} ry={12} />
        </clipPath>
      </defs>

      <rect width={W} height={H} rx={16} ry={16} fill="url(#lgTank)" stroke={stroke} strokeWidth={2.2} />

      {Array.from({ length: 5 }).map((_, i) => {
        const yy = P + (i * innerH) / 4;
        return <line key={i} x1={W - P + 2} y1={yy} x2={W - P + 8} y2={yy} stroke="#cbd5e1" strokeWidth={1} />;
      })}

      <g clipPath={`url(#${clipId})`}>
        <rect x={P} y={levelY} width={innerW} height={P + innerH - levelY} fill="url(#lgWaterDeep)" />
        <line x1={P} y1={levelY} x2={P + innerW} y2={levelY} stroke="#60a5fa" strokeWidth={1.5} />
        <rect x={P} y={P} width={innerW} height={innerH / 2.4} fill="url(#lgGlass)" opacity={0.18} />
      </g>

      <text x={W / 2} y={20} textAnchor="middle" fontSize={13} className="node-label">
        {n.name}
      </text>
      <text x={W / 2} y={H - 14} textAnchor="middle" className="node-subtle">
        {n.alarma ?? "sin alarma"}
      </text>

      {alarma === "critico" && (
        <g transform={`translate(${W - 18}, ${18})`}>
          <rect x={-14} y={-8} width={28} height={16} rx={8} fill="#fee2e2" stroke="#ef4444" />
          <circle r={3} fill="#ef4444" />
        </g>
      )}
    </g>
  );
}

function PumpNodeView({
  n,
  getPos,
  setPos,
  onDragEnd,
  showTip,
  hideTip,
}: {
  n: PumpNode;
  getPos: any;
  setPos: any;
  onDragEnd: () => void;
  showTip: (e: React.MouseEvent, content: { title: string; lines: string[] }) => void;
  hideTip: () => void;
}) {
  const drag = useNodeDragCommon(n, getPos, setPos, onDragEnd, hideTip);

  const rOuter = 26;
  const rInner = 15.5;
  const isRunning = (n.state || "").toLowerCase() === "run";
  const isOnline = n.online === true;

  const groupOpacity = isOnline ? 1 : 0.55;
  const stroke = isOnline ? "#16a34a" : "#94a3b8";
  const casingFill = "url(#lgSteel)";
  const impellerFill = isRunning && isOnline ? "#0ea5e9" : "#94a3b8";
  const labelState = (n.state || "bomba").toLowerCase();

  const tipLines = [`Online: ${isOnline ? "Sí" : "No"}`, `Estado: ${labelState}`];

  return (
    <g
      transform={`translate(${n.x}, ${n.y})`}
      onPointerDown={drag.onPointerDown}
      onPointerMove={drag.onPointerMove}
      onPointerUp={drag.onPointerUp}
      onMouseEnter={(e) => showTip(e, { title: n.name, lines: tipLines })}
      onMouseMove={(e) => showTip(e, { title: n.name, lines: tipLines })}
      onMouseLeave={hideTip}
      className="node-shadow"
      style={{ cursor: "move" }}
      opacity={groupOpacity}
    >
      <circle r={rOuter} fill={casingFill} stroke={stroke} strokeWidth={2.8} />
      <circle
        r={rOuter - 2}
        fill="none"
        stroke={isRunning && isOnline ? "#0ea5e9" : "transparent"}
        strokeWidth={2}
        strokeDasharray="6 10"
        opacity={0.8}
      >
        {isRunning && isOnline && (
          <animateTransform attributeName="transform" type="rotate" from="0 0 0" to="360 0 0" dur="2.4s" repeatCount="indefinite" />
        )}
      </circle>

      <circle r={rInner + 3} fill="#ffffff" stroke="#cbd5e1" strokeWidth={1.5} />
      <circle r={rInner + 3} fill="url(#lgGlass)" />

      <g>
        <circle r={2.6} fill={impellerFill} />
        {[0, 72, 144, 216, 288].map((deg) => (
          <path key={deg} d={`M 0 -${rInner} C 6 -${rInner - 6} 8 -6 4 -2 L 0 0 Z`} transform={`rotate(${deg})`} fill={impellerFill} opacity={0.95} />
        ))}
        {isRunning && isOnline && (
          <animateTransform attributeName="transform" type="rotate" from="0 0 0" to="360 0 0" dur="1.1s" repeatCount="indefinite" />
        )}
      </g>

      <circle cx={rOuter - 6} cy={-rOuter + 6} r={3.2} fill={isOnline ? "#22c55e" : "#a3a3a3"} />

      <text y={-rOuter - 12} textAnchor="middle" fontSize={12} className="node-label">
        {n.name}
      </text>
      <text y={rOuter + 16} textAnchor="middle" className="node-subtle">
        {labelState}
      </text>
    </g>
  );
}

function ManifoldNodeView({
  n,
  getPos,
  setPos,
  onDragEnd,
  showTip,
  hideTip,
}: {
  n: ManifoldNode;
  getPos: any;
  setPos: any;
  onDragEnd: () => void;
  showTip: (e: React.MouseEvent, content: { title: string; lines: string[] }) => void;
  hideTip: () => void;
}) {
  const drag = useNodeDragCommon(n, getPos, setPos, onDragEnd, hideTip);
  const w = 110, h = 16;
  const tipLines = ["Tipo: colector"];
  return (
    <g
      transform={`translate(${n.x - w / 2}, ${n.y - h / 2})`}
      onPointerDown={drag.onPointerDown}
      onPointerMove={drag.onPointerMove}
      onPointerUp={drag.onPointerUp}
      onMouseEnter={(e) => showTip(e, { title: n.name, lines: tipLines })}
      onMouseMove={(e) => showTip(e, { title: n.name, lines: tipLines })}
      onMouseLeave={hideTip}
      className="node-shadow"
      style={{ cursor: "move" }}
    >
      <rect width={w} height={h} rx={8} ry={8} fill="url(#lgSteel)" stroke="#475569" strokeWidth={2} />
      <text x={w / 2} y={-6} textAnchor="middle" className="node-subtle">
        {n.name} (colector)
      </text>
    </g>
  );
}

function ValveNodeView({
  n,
  getPos,
  setPos,
  onDragEnd,
  showTip,
  hideTip,
}: {
  n: ValveNode;
  getPos: any;
  setPos: any;
  onDragEnd: () => void;
  showTip: (e: React.MouseEvent, content: { title: string; lines: string[] }) => void;
  hideTip: () => void;
}) {
  const drag = useNodeDragCommon(n, getPos, setPos, onDragEnd, hideTip);
  const s = 20;
  const tipLines: string[] = ["Tipo: válvula"];
  return (
    <g
      transform={`translate(${n.x}, ${n.y})`}
      onPointerDown={drag.onPointerDown}
      onPointerMove={drag.onPointerMove}
      onPointerUp={drag.onPointerUp}
      onMouseEnter={(e) => showTip(e, { title: n.name, lines: tipLines })}
      onMouseMove={(e) => showTip(e, { title: n.name, lines: tipLines })}
      onMouseLeave={hideTip}
      className="node-shadow"
      style={{ cursor: "move" }}
    >
      <polygon points={`0,-${s / 2} ${s / 2},0 0,${s / 2} -${s / 2},0`} fill="#fff7ed" stroke="#f97316" strokeWidth={2} />
      <line x1="-14" y1="0" x2="14" y2="0" stroke="#f97316" strokeWidth={2} />
      <circle r="2" fill="#f97316" />
      <text y={s + 12} textAnchor="middle" className="node-subtle">
        {n.name} (válvula)
      </text>
    </g>
  );
}

// ==============================
// App
// ==============================
export default function App() {
  const [nodes, setNodes] = useState<UINode[]>([]);
  const [edges, setEdges] = useState<UIEdge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [viewBoxStr, setViewBoxStr] = useState("0 0 1000 520");

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

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [nodesRaw, edgesRaw] = await Promise.all([
          fetchJSON<CombinedNodeDTO[]>("/infraestructura/get_layout_combined"),
          fetchJSON<EdgeDTO[]>("/infraestructura/get_layout_edges"),
        ]);

        let uiNodes: UINode[] = (nodesRaw ?? []).map((n) => ({
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

        const uiEdges: UIEdge[] = (edgesRaw ?? []).map((e) => ({
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
      } catch (err: any) {
        console.error(err);
        setError(err?.message || "Error desconocido");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

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

  return (
    <div style={{ padding: 0 }}>
      {loading && <p style={{ margin: 12 }}>Cargando datos…</p>}
      {error && (
        <p style={{ color: "#b91c1c", margin: 12 }}>
          Error cargando datos: <strong>{error}</strong>
        </p>
      )}

      {!loading && !error && (
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
                <rect className="bg-grid" x="0" y="0" width="1000" height="520" />

                {/* Edges */}
                {edges.map((e, idx) => (
                  <Edge key={`edge-${idx}`} a={e.a} b={e.b} nodesById={nodesById} />
                ))}

                {/* Nodes */}
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
                      wrapperRect={wrapRef.current?.getBoundingClientRect() ?? null}
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
                    />
                  ) : null
                )}
              </svg>
            </TransformComponent>

            {/* Overlay de tooltip (si pasás el mouse) */}
            <Tooltip tip={tip} />
          </TransformWrapper>
        </div>
      )}
    </div>
  );
}
