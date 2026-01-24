// src/features/infra-diagram/components/edges/EditableEdge.tsx
import React, { useMemo, useRef, useState, useEffect, useCallback } from "react";
import type { UINode, PortId } from "../../types";

type Pt = { x: number; y: number };
type Side = "in" | "out";

type Props = {
  id: number;
  a: string;
  b: string;

  a_port?: PortId | null;
  b_port?: PortId | null;

  // ✅ flujo (viene desde InfraDiagram)
  flow?: { on: boolean; dir?: 1 | -1; strength?: number };

  // ✅ NUEVO: knots desde backend (layout_edge_knots)
  knots?: Pt[] | null;

  nodesById: Record<string, UINode>;
  editable: boolean;
  selected?: boolean;
  onSelect?: (edgeId: number) => void;
};

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

// ✅ logs apagados (si querés debug, ponelo true)
const LOG_ON = false;
function LOG(tag: string, payload?: any) {
  if (!LOG_ON) return;
  // eslint-disable-next-line no-console
  console.log(`🧪[Edge ${tag}]`, payload ?? "");
}

function normalizeKnots(input: any): Pt[] {
  if (!Array.isArray(input)) return [];
  return input
    .filter((p) => p && Number.isFinite(Number(p.x)) && Number.isFinite(Number(p.y)))
    .map((p) => ({ x: Number(p.x), y: Number(p.y) }));
}

/* =========================
   PORTS
========================= */
function getDefaultPort(n: UINode, side: Side) {
  const t = String(n.type || "").toLowerCase();

  let x = n.x;
  let y = n.y;

  if (t === "pump") {
    const rOuter = 26;
    const portOffset = 6;
    x = side === "in" ? n.x - rOuter - portOffset : n.x + rOuter + portOffset;
    y = n.y;
    return { x, y };
  }

  if (t === "tank") {
    const halfW = 66;
    const portOffset = 6;
    x = side === "in" ? n.x - halfW - portOffset : n.x + halfW + portOffset;
    y = n.y;
    return { x, y };
  }

  if (t === "manifold") {
    const halfW = 55;
    const portOffset = 6;
    x = side === "in" ? n.x - halfW - portOffset : n.x + halfW + portOffset;
    y = n.y;
    return { x, y };
  }

  if (t === "valve") {
    const half = 14;
    const portOffset = 6;
    x = side === "in" ? n.x - half - portOffset : n.x + half + portOffset;
    y = n.y;
    return { x, y };
  }

  return { x, y };
}

function getPortPos(n: UINode, side: Side, portId?: PortId | null) {
  if (!portId) return getDefaultPort(n, side);
  const pid = String(portId);

  if (n.type === "tank") {
    const W = 132;
    const H = 100;
    const OUT = 6;

    const leftX = n.x - W / 2 - OUT;
    const rightX = n.x + W / 2 + OUT;

    const topY = n.y - H * 0.22;
    const midY = n.y;
    const botY = n.y + H * 0.22;

    switch (pid) {
      case "L1":
        return { x: leftX, y: midY };
      case "L2":
        return { x: leftX, y: botY };
      case "R1":
        return { x: rightX, y: topY };
      case "R2":
        return { x: rightX, y: midY };
      case "R3":
        return { x: rightX, y: botY };
      case "T1":
        return { x: n.x, y: n.y - H / 2 - OUT };
      case "B1":
        return { x: n.x, y: n.y + H / 2 + OUT };
      default:
        return getDefaultPort(n, side);
    }
  }

  if (n.type === "pump") {
    const rOuter = 26;
    const portOffset = 6;
    if (pid.startsWith("L")) return { x: n.x - rOuter - portOffset, y: n.y };
    if (pid.startsWith("R")) return { x: n.x + rOuter + portOffset, y: n.y };
    if (pid === "T1") return { x: n.x, y: n.y - rOuter - portOffset };
    if (pid === "B1") return { x: n.x, y: n.y + rOuter + portOffset };
    return getDefaultPort(n, side);
  }

  if (n.type === "manifold") {
    const halfW = 55;
    const OUT = 6;

    const leftX = n.x - halfW - OUT;
    const rightX = n.x + halfW + OUT;

    const topY = n.y - 14;
    const midY = n.y;
    const botY = n.y + 14;

    switch (pid) {
      case "L1":
        return { x: leftX, y: topY };
      case "L2":
        return { x: leftX, y: botY };
      case "R1":
        return { x: rightX, y: topY };
      case "R2":
        return { x: rightX, y: midY };
      case "R3":
        return { x: rightX, y: botY };
      case "R4":
        return { x: rightX, y: botY + 14 };
      case "T1":
        return { x: n.x, y: n.y - 22 - OUT };
      case "B1":
        return { x: n.x, y: n.y + 22 + OUT };
      default:
        return getDefaultPort(n, side);
    }
  }

  if (n.type === "valve") {
    const half = 14;
    const OUT = 6;

    const leftX = n.x - half - OUT;
    const rightX = n.x + half + OUT;

    switch (pid) {
      case "L1":
      case "L2":
        return { x: leftX, y: n.y };
      case "R1":
      case "R2":
      case "R3":
        return { x: rightX, y: n.y };
      case "T1":
        return { x: n.x, y: n.y - half - OUT };
      case "B1":
        return { x: n.x, y: n.y + half + OUT };
      default:
        return getDefaultPort(n, side);
    }
  }

  return getDefaultPort(n, side);
}

/* =========================
   SVG COORDS
========================= */
function svgPointFromEvent(e: React.PointerEvent | React.MouseEvent): Pt | null {
  const target = e.currentTarget as SVGElement;
  const svg = (target.ownerSVGElement || target) as SVGSVGElement | null;
  if (!svg) return null;

  const pt = svg.createSVGPoint();
  pt.x = (e as any).clientX;
  pt.y = (e as any).clientY;

  const m = svg.getScreenCTM();
  if (!m) return null;

  const p = pt.matrixTransform(m.inverse());
  return { x: p.x, y: p.y };
}

/* =========================
   ORTHO PATH
========================= */
function orthoLeg(a: Pt, b: Pt): Pt[] {
  return [{ x: b.x, y: a.y }, { x: b.x, y: b.y }];
}

function orthogonalPath(points: Pt[]) {
  if (points.length < 2) return `M 0 0`;

  const expanded: Pt[] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const prev = expanded[expanded.length - 1];
    const next = points[i];
    const legs = orthoLeg(prev, next);
    for (const p of legs) {
      const last = expanded[expanded.length - 1];
      if (Math.abs(p.x - last.x) < 0.001 && Math.abs(p.y - last.y) < 0.001) continue;
      expanded.push(p);
    }
  }

  const cleaned: Pt[] = [];
  for (const p of expanded) {
    const a = cleaned[cleaned.length - 2];
    const b = cleaned[cleaned.length - 1];
    if (!b) {
      cleaned.push(p);
      continue;
    }
    if (!a) {
      cleaned.push(p);
      continue;
    }
    const colX = Math.abs(a.x - b.x) < 0.001 && Math.abs(b.x - p.x) < 0.001;
    const colY = Math.abs(a.y - b.y) < 0.001 && Math.abs(b.y - p.y) < 0.001;
    if (colX || colY) cleaned[cleaned.length - 1] = p;
    else cleaned.push(p);
  }

  let d = `M ${cleaned[0].x} ${cleaned[0].y}`;
  for (let i = 1; i < cleaned.length; i++) {
    const p0 = cleaned[i - 1];
    const p1 = cleaned[i];
    const p2 = cleaned[i + 1];

    if (!p2) {
      d += ` L ${p1.x} ${p1.y}`;
      continue;
    }

    const dx1 = p1.x - p0.x;
    const dy1 = p1.y - p0.y;
    const dx2 = p2.x - p1.x;
    const dy2 = p2.y - p1.y;

    const isTurn =
      (Math.abs(dx1) < 0.001 && Math.abs(dy2) < 0.001) ||
      (Math.abs(dy1) < 0.001 && Math.abs(dx2) < 0.001);

    if (!isTurn) {
      d += ` L ${p1.x} ${p1.y}`;
      continue;
    }

    const len1 = Math.abs(dx1) + Math.abs(dy1);
    const len2 = Math.abs(dx2) + Math.abs(dy2);
    const r = clamp(Math.min(len1, len2) / 3, 6, 14);

    const u1: Pt =
      Math.abs(dx1) > Math.abs(dy1)
        ? { x: p1.x - Math.sign(dx1) * r, y: p1.y }
        : { x: p1.x, y: p1.y - Math.sign(dy1) * r };

    const u2: Pt =
      Math.abs(dx2) > Math.abs(dy2)
        ? { x: p1.x + Math.sign(dx2) * r, y: p1.y }
        : { x: p1.x, y: p1.y + Math.sign(dy2) * r };

    d += ` L ${u1.x} ${u1.y}`;
    d += ` Q ${p1.x} ${p1.y} ${u2.x} ${u2.y}`;
  }

  return d;
}

function basePath(A: UINode, B: UINode, aPort?: PortId | null, bPort?: PortId | null) {
  const S = getPortPos(A, "out", aPort);
  const E = getPortPos(B, "in", bPort);

  const sx = S.x;
  const sy = S.y;
  const ex = E.x;
  const ey = E.y;

  const dx = Math.abs(ex - sx);
  const dy = Math.abs(ey - sy);

  if (dy < 2 || dx < 2) return { sx, sy, ex, ey, d: `M ${sx} ${sy} L ${ex} ${ey}` };

  const mx = (sx + ex) / 2;
  const pts: Pt[] = [
    { x: sx, y: sy },
    { x: mx, y: sy },
    { x: mx, y: ey },
    { x: ex, y: ey },
  ];
  return { sx, sy, ex, ey, d: orthogonalPath(pts) };
}

export default function EditableEdge({
  id,
  a,
  b,
  a_port,
  b_port,
  flow,
  knots: knotsFromServer,
  nodesById,
  editable,
  selected,
  onSelect,
}: Props) {
  const A = nodesById[a];
  const B = nodesById[b];

  // ✅ knots desde backend
  const [knots, setKnots] = useState<Pt[]>(() => normalizeKnots(knotsFromServer));

  // ✅ sincroniza si llegan knots nuevos desde server (ej: refresh / otro usuario)
  // pero NO pisa mientras arrastrás
  const dragging = useRef<{ idx: number } | null>(null);
  const hasCapture = useRef(false);

  useEffect(() => {
    if (hasCapture.current) return; // no pisar durante drag
    setKnots(normalizeKnots(knotsFromServer));
  }, [knotsFromServer]);

  // -------- persistencia a DB (debounce) --------
  const saveTimer = useRef<number | null>(null);
  const lastSavedSig = useRef<string>("");

  const postSave = useCallback(
    async (pts: Pt[]) => {
      const clean = normalizeKnots(pts);
      const sig = JSON.stringify(clean);
      if (sig === lastSavedSig.current) return;

      try {
        const res = await fetch("/infraestructura/update_edge_knots", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ edge_id: id, knots: clean }),
        });
        if (!res.ok) {
          const t = await res.text().catch(() => "");
          console.error("update_edge_knots failed:", res.status, t);
          return;
        }
        lastSavedSig.current = sig;
        LOG("SAVED_DB", { id, count: clean.length });
      } catch (e) {
        console.error("update_edge_knots error:", e);
      }
    },
    [id]
  );

  const scheduleSave = useCallback(
    (pts: Pt[]) => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => {
        saveTimer.current = null;
        postSave(pts);
      }, 350);
    },
    [postSave]
  );

  useEffect(() => {
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, []);

  const geom = useMemo(() => {
    if (!A || !B) return null;

    const base = basePath(A, B, a_port ?? null, b_port ?? null);
    const pts: Pt[] = [{ x: base.sx, y: base.sy }, ...knots, { x: base.ex, y: base.ey }];
    const d = knots.length ? orthogonalPath(pts) : base.d;

    return { ...base, d };
  }, [A, B, a_port, b_port, knots]);

  if (!A || !B || !geom) return null;

  const STROKE_OUTER = 10;
  const STROKE_BODY = 7;
  const STROKE_HL = 2.2;
  const HIT_STROKE = 18;

  const COUPLER_R_OUT = 3.6;
  const COUPLER_R_IN = 2.2;

  const HANDLE_R = 6;

  // ✅ Flujo: parámetros visuales
  const flowOn = !!flow?.on;
  const flowDir = (flow?.dir ?? 1) as 1 | -1;
  const flowStrength = Math.max(0, Math.min(1, Number(flow?.strength ?? (flowOn ? 1 : 0))));
  const FLOW_STROKE = 2.8 + flowStrength * 1.6;
  const FLOW_DASH = "10 14";
  const FLOW_SPEED = 0.9 - flowStrength * 0.35;
  const FLOW_OFFSET = flowDir === 1 ? -48 : 48;

  const addPoint = (e: React.PointerEvent | React.MouseEvent, source: string) => {
    const p = svgPointFromEvent(e);
    LOG("ADD_POINT", { id, source, p, prevKnots: knots.length });
    if (!p) return;
    setKnots((prev) => {
      const next = [...prev, p];
      scheduleSave(next);
      return next;
    });
  };

  const showHandles = editable && (selected || knots.length > 0);

  const stopIfDragging = (e: React.SyntheticEvent) => {
    if (!hasCapture.current) return;
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <g onPointerDown={stopIfDragging} onPointerMove={stopIfDragging} onPointerUp={stopIfDragging}>
      {/* tubería */}
      <path
        d={geom.d}
        fill="none"
        stroke="#0f172a"
        strokeWidth={STROKE_OUTER}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.55}
      />
      <path
        d={geom.d}
        fill="none"
        stroke="#cbd5e1"
        strokeWidth={STROKE_BODY}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.95}
      />
      <path
        d={geom.d}
        fill="none"
        stroke="rgba(255,255,255,0.45)"
        strokeWidth={STROKE_HL}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.9}
      />

      {/* flujo */}
      {flowOn && (
        <path
          d={geom.d}
          fill="none"
          stroke={`rgba(59,130,246,${0.55 + 0.35 * flowStrength})`}
          strokeWidth={FLOW_STROKE}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={FLOW_DASH}
          style={{ pointerEvents: "none" }}
        >
          <animate attributeName="stroke-dashoffset" from={0} to={FLOW_OFFSET} dur={`${Math.max(0.35, FLOW_SPEED)}s`} repeatCount="indefinite" />
        </path>
      )}

      {/* acoples */}
      <circle cx={geom.sx} cy={geom.sy} r={COUPLER_R_OUT} fill="#0f172a" opacity={0.35} />
      <circle cx={geom.sx} cy={geom.sy} r={COUPLER_R_IN} fill="#e2e8f0" opacity={0.98} />
      <circle cx={geom.ex} cy={geom.ey} r={COUPLER_R_OUT} fill="#0f172a" opacity={0.35} />
      <circle cx={geom.ex} cy={geom.ey} r={COUPLER_R_IN} fill="#e2e8f0" opacity={0.98} />

      {/* hit test */}
      <path
        d={geom.d}
        stroke="transparent"
        strokeWidth={HIT_STROKE}
        fill="none"
        style={{ pointerEvents: "stroke", cursor: editable ? "pointer" : "default" }}
        onPointerDown={(e) => {
          if (!editable) return;
          e.preventDefault();
          e.stopPropagation();
          onSelect?.(id);
          if ((e as any).shiftKey) addPoint(e, "hit:pointerdown");
        }}
        onClick={(e) => {
          if (!editable) return;
          e.stopPropagation();
          onSelect?.(id);
        }}
      />

      {/* HANDLES */}
      {showHandles &&
        knots.map((p, idx) => (
          <g key={`knot-${id}-${idx}`}>
            {/* zona grande de agarre */}
            <circle
              cx={p.x}
              cy={p.y}
              r={HANDLE_R + 10}
              fill="transparent"
              style={{ pointerEvents: "all", cursor: "move", touchAction: "none" }}
              onPointerDown={(e) => {
                if (!editable) return;
                e.preventDefault();
                e.stopPropagation();
                onSelect?.(id);

                hasCapture.current = true;
                (e.currentTarget as SVGCircleElement).setPointerCapture(e.pointerId);
                dragging.current = { idx };
              }}
              onPointerMove={(e) => {
                if (!dragging.current || dragging.current.idx !== idx) return;
                const pt = svgPointFromEvent(e);
                if (!pt) return;

                e.preventDefault();
                e.stopPropagation();
                setKnots((prev) => {
                  const next = prev.map((q, i) => (i === idx ? pt : q));
                  scheduleSave(next);
                  return next;
                });
              }}
              onPointerUp={(e) => {
                if (!editable) return;
                e.preventDefault();
                e.stopPropagation();

                dragging.current = null;
                hasCapture.current = false;

                try {
                  (e.currentTarget as SVGCircleElement).releasePointerCapture(e.pointerId);
                } catch {}
              }}
            />

            {/* handle visible */}
            <circle
              cx={p.x}
              cy={p.y}
              r={HANDLE_R}
              fill="#ffffff"
              stroke="#0ea5e9"
              strokeWidth={2}
              opacity={0.95}
              style={{ pointerEvents: "all", cursor: "move", touchAction: "none" }}
              onPointerDown={(e) => {
                if (!editable) return;
                e.preventDefault();
                e.stopPropagation();
                onSelect?.(id);

                hasCapture.current = true;
                (e.currentTarget as SVGCircleElement).setPointerCapture(e.pointerId);
                dragging.current = { idx };
              }}
              onPointerMove={(e) => {
                if (!dragging.current || dragging.current.idx !== idx) return;
                const pt = svgPointFromEvent(e);
                if (!pt) return;

                e.preventDefault();
                e.stopPropagation();
                setKnots((prev) => {
                  const next = prev.map((q, i) => (i === idx ? pt : q));
                  scheduleSave(next);
                  return next;
                });
              }}
              onPointerUp={(e) => {
                if (!editable) return;
                e.preventDefault();
                e.stopPropagation();

                dragging.current = null;
                hasCapture.current = false;

                try {
                  (e.currentTarget as SVGCircleElement).releasePointerCapture(e.pointerId);
                } catch {}
              }}
              onClick={(e) => {
                if (!editable) return;
                if ((e as any).altKey) {
                  e.stopPropagation();
                  setKnots((prev) => {
                    const next = prev.filter((_, i) => i !== idx);
                    scheduleSave(next);
                    return next;
                  });
                }
              }}
            />
          </g>
        ))}

      {/* selección visual */}
      {selected && (
        <>
          <path
            d={geom.d}
            fill="none"
            stroke="#38bdf8"
            strokeWidth={STROKE_OUTER + 2}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={0.22}
          />
          <path
            d={geom.d}
            fill="none"
            stroke="#0ea5e9"
            strokeWidth={3.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={0.95}
          />
        </>
      )}
    </g>
  );
}
