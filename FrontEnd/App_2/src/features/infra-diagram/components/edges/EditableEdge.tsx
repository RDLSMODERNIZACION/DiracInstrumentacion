// src/features/infra-diagram/components/edges/EditableEdge.tsx
import React, { useMemo, useRef, useState, useEffect, useCallback } from "react";
import type { UINode, PortId } from "../../types";

// ✅ usar API_BASE + withScope + authHeaders (para que NO pegue al dominio del frontend)
import { API_BASE } from "@/lib/api";
import { withScope } from "@/lib/scope";
import { authHeaders } from "@/lib/http";

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

/* =========================
   DEBUG / LOGS
========================= */
const DEBUG_EDGE = true; // 👈 dejalo true para ver qué pasa, luego pasalo a false

function logEdge(tag: string, payload?: any) {
  if (!DEBUG_EDGE) return;
  // eslint-disable-next-line no-console
  console.log(`🧩[EditableEdge] ${tag}`, payload ?? "");
}
function warnEdge(tag: string, payload?: any) {
  if (!DEBUG_EDGE) return;
  // eslint-disable-next-line no-console
  console.warn(`⚠️[EditableEdge] ${tag}`, payload ?? "");
}
function errEdge(tag: string, payload?: any) {
  // errores conviene verlos siempre
  // eslint-disable-next-line no-console
  console.error(`🧨[EditableEdge] ${tag}`, payload ?? "");
}

function normalizeKnots(input: any): Pt[] {
  if (!Array.isArray(input)) return [];
  return input
    .filter((p) => p && Number.isFinite(Number(p.x)) && Number.isFinite(Number(p.y)))
    .map((p) => ({ x: Number(p.x), y: Number(p.y) }));
}

/* =========================
   PORTS (con rot/flip para válvulas 2way/3way)
========================= */
type ValveMeta = {
  model?: "2way" | "3way";
  rot?: 0 | 90 | 180 | 270;
  flipX?: boolean;
  ports?: Record<string, "open" | "closed">;
};

function getValveMeta(n: any): Required<Pick<ValveMeta, "model" | "rot" | "flipX">> {
  const m = (n?.meta ?? {}) as ValveMeta;
  const model = (m.model ?? "2way") as "2way" | "3way";
  const rot = (m.rot ?? 0) as 0 | 90 | 180 | 270;
  const flipX = Boolean(m.flipX ?? false);
  return { model, rot, flipX };
}

function applyValveXForm(n: any, local: Pt): Pt {
  const { rot, flipX } = getValveMeta(n);

  let x = local.x;
  let y = local.y;

  // flip horizontal local
  if (flipX) x = -x;

  // rotate around (0,0)
  let xr = x,
    yr = y;
  if (rot === 90) {
    xr = -y;
    yr = x;
  } else if (rot === 180) {
    xr = -x;
    yr = -y;
  } else if (rot === 270) {
    xr = y;
    yr = -x;
  }

  return { x: n.x + xr, y: n.y + yr };
}

function getDefaultPort(n: UINode, side: Side) {
  const t = String((n as any).type || "").toLowerCase();

  let x = (n as any).x;
  let y = (n as any).y;

  if (t === "pump") {
    const rOuter = 26;
    const portOffset = 6;
    x = side === "in" ? (n as any).x - rOuter - portOffset : (n as any).x + rOuter + portOffset;
    y = (n as any).y;
    return { x, y };
  }

  if (t === "tank") {
    const halfW = 66;
    const portOffset = 6;
    x = side === "in" ? (n as any).x - halfW - portOffset : (n as any).x + halfW + portOffset;
    y = (n as any).y;
    return { x, y };
  }

  if (t === "manifold") {
    const halfW = 55;
    const portOffset = 6;
    x = side === "in" ? (n as any).x - halfW - portOffset : (n as any).x + halfW + portOffset;
    y = (n as any).y;
    return { x, y };
  }

  // ✅ valve: default depende de model (2way vs 3way) y se transforma por rot/flip
  if (t === "valve") {
    const { model } = getValveMeta(n as any);
    const half = 16;
    const OUT = 8;

    const L1: Pt = { x: -half - OUT, y: 0 }; // entrada
    const R_2WAY: Pt = { x: half + OUT, y: 0 };
    const R1: Pt = { x: half + OUT, y: -12 };
    const R2: Pt = { x: half + OUT, y: 12 };

    const local = side === "in" ? L1 : model === "3way" ? R1 : R_2WAY;
    return applyValveXForm(n as any, local);
  }

  return { x, y };
}

function getPortPos(n: UINode, side: Side, portId?: PortId | null) {
  if (!portId) return getDefaultPort(n, side);
  const pid = String(portId);

  if ((n as any).type === "tank") {
    const W = 132;
    const H = 100;
    const OUT = 6;

    const leftX = (n as any).x - W / 2 - OUT;
    const rightX = (n as any).x + W / 2 + OUT;

    const topY = (n as any).y - H * 0.22;
    const midY = (n as any).y;
    const botY = (n as any).y + H * 0.22;

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
        return { x: (n as any).x, y: (n as any).y - H / 2 - OUT };
      case "B1":
        return { x: (n as any).x, y: (n as any).y + H / 2 + OUT };
      default:
        return getDefaultPort(n, side);
    }
  }

  if ((n as any).type === "pump") {
    const rOuter = 26;
    const portOffset = 6;
    if (pid.startsWith("L")) return { x: (n as any).x - rOuter - portOffset, y: (n as any).y };
    if (pid.startsWith("R")) return { x: (n as any).x + rOuter + portOffset, y: (n as any).y };
    if (pid === "T1") return { x: (n as any).x, y: (n as any).y - rOuter - portOffset };
    if (pid === "B1") return { x: (n as any).x, y: (n as any).y + rOuter + portOffset };
    return getDefaultPort(n, side);
  }

  if ((n as any).type === "manifold") {
    const halfW = 55;
    const OUT = 6;

    const leftX = (n as any).x - halfW - OUT;
    const rightX = (n as any).x + halfW + OUT;

    const topY = (n as any).y - 14;
    const midY = (n as any).y;
    const botY = (n as any).y + 14;

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
        return { x: (n as any).x, y: (n as any).y - 22 - OUT };
      case "B1":
        return { x: (n as any).x, y: (n as any).y + 22 + OUT };
      default:
        return getDefaultPort(n, side);
    }
  }

  // ✅ VALVE (2way/3way con rot/flip)
  if ((n as any).type === "valve") {
    const { model } = getValveMeta(n as any);
    const half = 16;
    const OUT = 8;

    // locales
    const L1: Pt = { x: -half - OUT, y: 0 };

    // 2way
    const R_2WAY: Pt = { x: half + OUT, y: 0 };

    // 3way
    const R1: Pt = { x: half + OUT, y: -12 };
    const R2: Pt = { x: half + OUT, y: 12 };

    let local: Pt;

    if (model === "3way") {
      if (pid === "L1") local = L1;
      else if (pid === "R2") local = R2;
      else local = R1; // default salida
    } else {
      // 2way
      if (pid === "L1" || pid === "L2") local = L1;
      else local = R_2WAY;
    }

    return applyValveXForm(n as any, local);
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
    const nk = normalizeKnots(knotsFromServer);
    setKnots(nk);
    logEdge("INIT/SYNC_KNOTS_FROM_SERVER", {
      edge_id: id,
      server_len: Array.isArray(knotsFromServer) ? knotsFromServer.length : null,
      normalized_len: nk.length,
      server_sample: Array.isArray(knotsFromServer) ? knotsFromServer.slice(0, 2) : null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [knotsFromServer, id]);

  // -------- persistencia a DB (debounce) --------
  const saveTimer = useRef<number | null>(null);
  const lastSavedSig = useRef<string>("");
  const inFlight = useRef(false);

  const postSave = useCallback(
    async (pts: Pt[], reason: string) => {
      const clean = normalizeKnots(pts);
      const sig = JSON.stringify(clean);
      const url = withScope(`${API_BASE}/infraestructura/update_edge_knots`);
      const headers = { "Content-Type": "application/json", ...authHeaders() };
      const body = { edge_id: id, knots: clean };

      if (sig === lastSavedSig.current) {
        logEdge("SAVE_SKIP_SAME_SIG", { edge_id: id, reason, len: clean.length });
        return;
      }
      if (inFlight.current) {
        warnEdge("SAVE_SKIP_INFLIGHT", { edge_id: id, reason, len: clean.length });
        return;
      }

      inFlight.current = true;
      const t0 = performance.now();

      logEdge("SAVE_START", {
        edge_id: id,
        reason,
        url,
        len: clean.length,
        headers_has_auth: Object.keys(headers).some((k) => k.toLowerCase().includes("authorization")),
        sample: clean.slice(0, 2),
      });

      try {
        const res = await fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
        });

        const dt = Math.round(performance.now() - t0);

        if (!res.ok) {
          const text = await res.text().catch(() => "");
          errEdge("SAVE_FAIL", {
            edge_id: id,
            reason,
            url,
            status: res.status,
            ms: dt,
            resp: text?.slice(0, 300),
          });
          return;
        }

        let jsonOut: any = null;
        try {
          jsonOut = await res.json();
        } catch {
          // ok
        }

        lastSavedSig.current = sig;
        logEdge("SAVE_OK", { edge_id: id, reason, ms: dt, result: jsonOut ?? "(no json)" });
      } catch (e: any) {
        const dt = Math.round(performance.now() - t0);
        errEdge("SAVE_ERROR", { edge_id: id, reason, url, ms: dt, error: String(e?.message ?? e) });
      } finally {
        inFlight.current = false;
      }
    },
    [id]
  );

  const scheduleSave = useCallback(
    (pts: Pt[], reason: string) => {
      const clean = normalizeKnots(pts);
      const sig = JSON.stringify(clean);

      logEdge("SAVE_SCHEDULE", {
        edge_id: id,
        reason,
        debounce_ms: 350,
        len: clean.length,
        sig_changed: sig !== lastSavedSig.current,
      });

      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => {
        saveTimer.current = null;
        postSave(pts, reason);
      }, 350);
    },
    [id, postSave]
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
    logEdge("ADD_POINT", { edge_id: id, source, p, prevKnots: knots.length });
    if (!p) return;
    setKnots((prev) => {
      const next = [...prev, p];
      scheduleSave(next, `add_point:${source}`);
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
          <animate
            attributeName="stroke-dashoffset"
            from={0}
            to={FLOW_OFFSET}
            dur={`${Math.max(0.35, FLOW_SPEED)}s`}
            repeatCount="indefinite"
          />
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

                logEdge("DRAG_START", { edge_id: id, idx, at: { x: p.x, y: p.y } });
              }}
              onPointerMove={(e) => {
                if (!dragging.current || dragging.current.idx !== idx) return;
                const pt = svgPointFromEvent(e);
                if (!pt) return;

                e.preventDefault();
                e.stopPropagation();
                setKnots((prev) => {
                  const next = prev.map((q, i) => (i === idx ? pt : q));
                  scheduleSave(next, `drag_move:idx=${idx}`);
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

                logEdge("DRAG_END", { edge_id: id, idx });
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

                logEdge("DRAG_START(handle)", { edge_id: id, idx, at: { x: p.x, y: p.y } });
              }}
              onPointerMove={(e) => {
                if (!dragging.current || dragging.current.idx !== idx) return;
                const pt = svgPointFromEvent(e);
                if (!pt) return;

                e.preventDefault();
                e.stopPropagation();
                setKnots((prev) => {
                  const next = prev.map((q, i) => (i === idx ? pt : q));
                  scheduleSave(next, `drag_move(handle):idx=${idx}`);
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

                logEdge("DRAG_END(handle)", { edge_id: id, idx });
              }}
              onClick={(e) => {
                if (!editable) return;
                if ((e as any).altKey) {
                  e.stopPropagation();
                  setKnots((prev) => {
                    const next = prev.filter((_, i) => i !== idx);
                    logEdge("REMOVE_POINT", { edge_id: id, idx, new_len: next.length });
                    scheduleSave(next, `remove_point:idx=${idx}`);
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
