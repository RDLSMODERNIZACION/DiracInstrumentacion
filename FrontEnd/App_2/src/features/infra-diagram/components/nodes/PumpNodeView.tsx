import React from "react";
import useNodeDragCommon from "../../useNodeDragCommon";
import type { PumpNode } from "../../types";
import { API_BASE } from "@/lib/api";

type PumpOrientation = "vertical" | "horizontal";

type PumpElectricalEstimate = {
  analyzer_id?: number | null;
  window_days?: number;
  pump?: {
    pump_id?: number;
    current_a_est?: number | null;
    current_a_est_raw?: number | null;
    current_a_sd?: number | null;
    current_a_min_theoretical?: number | null;
    current_confidence?: string | null;
    operating_kw_est?: number | null;
    valid_starts?: number | null;
  };
};

function extractPumpId(n: any): number | null {
  const candidates = [n?.pump_id, n?.pumpId, n?.id];
  for (const c of candidates) {
    const direct = Number(c);
    if (Number.isFinite(direct) && direct > 0) return Math.trunc(direct);
    const m = String(c ?? "").match(/(\d+)/);
    if (m?.[1]) {
      const v = Number(m[1]);
      if (Number.isFinite(v) && v > 0) return Math.trunc(v);
    }
  }
  return null;
}

export default function PumpNodeView({
  n,
  getPos,
  setPos,
  onDragEnd,
  showTip,
  hideTip,
  enabled = true,
  onClick,
  tapConnectMode = false,
  tapSelected = false,
  onTapSelect,
}: {
  n: PumpNode & {
    name?: string | null;
    in_maintenance?: boolean | null;
    orientacion?: PumpOrientation | null;
    meta?: any;
    orientation?: PumpOrientation;
    current_a?: number | string | null;
    amperes?: number | string | null;
    current?: number | string | null;
  };
  getPos: any;
  setPos: any;
  onDragEnd: () => void;
  showTip: (e: React.MouseEvent, content: { title: string; lines: string[] }) => void;
  hideTip: () => void;
  enabled?: boolean;
  onClick?: () => void;
  tapConnectMode?: boolean;
  tapSelected?: boolean;
  onTapSelect?: (nodeId: string) => void;
}) {
  const drag = useNodeDragCommon(n, getPos, setPos, onDragEnd, hideTip, enabled);

  const orientation: PumpOrientation =
    (n.orientacion as PumpOrientation) ||
    ((n as any).meta?.orientation as PumpOrientation) ||
    ((n as any).orientation as PumpOrientation) ||
    "vertical";

  const name =
    typeof n.name === "string" && n.name.trim()
      ? n.name.trim()
      : `Bomba ${n.id}`;

  const state = String(n.state || "").toLowerCase();
  const running = ["run", "running", "on", "1", "true"].includes(state);
  const online = n.online === true;
  const maintenance = (n as any).in_maintenance === true;
  const controlMode = "M";

  const pumpId = React.useMemo(() => extractPumpId(n), [n]);
  const [electrical, setElectrical] = React.useState<PumpElectricalEstimate | null>(null);

  React.useEffect(() => {
    if (!pumpId) {
      setElectrical(null);
      return;
    }

    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let ctrl: AbortController | null = null;

    async function tick() {
      ctrl = new AbortController();
      try {
        const r = await fetch(
          `${API_BASE}/components/network_analyzers/pump-energy/by-pump/${pumpId}?days=30`,
          {
            method: "GET",
            headers: { Accept: "application/json" },
            cache: "no-store",
            signal: ctrl.signal,
          }
        );
        if (!alive) return;
        if (!r.ok) {
          setElectrical(null);
        } else {
          setElectrical((await r.json()) as PumpElectricalEstimate);
        }
      } catch {
        if (alive) setElectrical(null);
      } finally {
        if (alive) timer = setTimeout(tick, 30000);
      }
    }

    tick();
    return () => {
      alive = false;
      ctrl?.abort();
      if (timer) clearTimeout(timer);
    };
  }, [pumpId]);

  const directCurrent = Number(
    (n as any).current_a ??
    (n as any).amperes ??
    (n as any).current ??
    NaN
  );

  const estimatedCurrent = Number(electrical?.pump?.current_a_est ?? NaN);
  const hasDirectCurrent = Number.isFinite(directCurrent);
  const hasEstimatedCurrent = Number.isFinite(estimatedCurrent) && estimatedCurrent > 0;

  const currentText = hasDirectCurrent
    ? `${directCurrent.toFixed(1)} A`
    : hasEstimatedCurrent
    ? `≈${estimatedCurrent.toFixed(1)} A`
    : "-- A";

  const currentTooltip = hasDirectCurrent
    ? `Corriente: ${directCurrent.toFixed(1)} A`
    : hasEstimatedCurrent
    ? `Corriente estimada: ${estimatedCurrent.toFixed(1)} A (${electrical?.pump?.current_confidence ?? "estimada"})`
    : "Corriente estimada: sin datos confiables";

  const motorFill = !online
    ? "#cbd5e1"
    : maintenance
    ? "#fbbf24"
    : running
    ? "#ef6c35"
    : "#b8c2cc";

  const motorStroke = tapSelected
    ? "#0ea5e9"
    : !online
    ? "#94a3b8"
    : maintenance
    ? "#d97706"
    : running
    ? "#c2410c"
    : "#64748b";

  const tipLines = [
    `ID: ${n.id}`,
    `Estado: ${running ? "En marcha" : "Detenida"}`,
    `Comunicación: ${online ? "Online" : "Offline"}`,
    `Montaje: ${orientation === "horizontal" ? "Horizontal" : "Vertical"}`,
    `Modo: Manual`,
    currentTooltip,
    electrical?.pump?.operating_kw_est != null
      ? `Potencia estimada: ${Number(electrical.pump.operating_kw_est).toFixed(1)} kW`
      : "",
  ].filter(Boolean);

  const handlePointerDown = (e: React.PointerEvent<SVGGElement>) => {
    if (tapConnectMode) {
      e.preventDefault();
      e.stopPropagation();
      onTapSelect?.(n.id);
      return;
    }
    if (enabled) drag.onPointerDown(e);
  };

  const handlePointerMove = (e: React.PointerEvent<SVGGElement>) => {
    if (!tapConnectMode && enabled) drag.onPointerMove(e);
  };

  const handlePointerUp = (e: React.PointerEvent<SVGGElement>) => {
    if (!tapConnectMode && enabled) drag.onPointerUp(e);
  };

  const handleClick = (e: React.MouseEvent<SVGGElement>) => {
    e.stopPropagation();
    if (!tapConnectMode) onClick?.();
  };

  const interactionProps = {
    onPointerDown: handlePointerDown,
    onPointerMove: handlePointerMove,
    onPointerUp: handlePointerUp,
    onMouseEnter: (e: React.MouseEvent<SVGGElement>) =>
      showTip(e, { title: name, lines: tipLines }),
    onMouseMove: (e: React.MouseEvent<SVGGElement>) =>
      showTip(e, { title: name, lines: tipLines }),
    onMouseLeave: hideTip,
    onClick: handleClick,
  };

  if (orientation === "horizontal") {
    return (
      <g
        transform={`translate(${n.x}, ${n.y})`}
        {...interactionProps}
        style={{
          cursor: tapConnectMode ? "crosshair" : enabled ? "move" : "default",
          touchAction: "none",
        }}
        opacity={online ? 1 : 0.58}
      >
        <text x={72} y={4} textAnchor="start" fill="#1e293b" style={{ fontSize: 14, fontWeight: 850, pointerEvents: "none" }}>
          {name}
        </text>

        <rect x={-48} y={-16} width={70} height={34} rx={12} fill={motorFill} stroke={motorStroke} strokeWidth={tapSelected ? 4 : 2.3} />

        {[-30, -14, 2].map((x) => (
          <line key={x} x1={x} y1={-13} x2={x} y2={15} stroke="#fff" strokeWidth={2} opacity={0.25} style={{ pointerEvents: "none" }} />
        ))}

        <rect x={22} y={-9} width={12} height={18} rx={4} fill="#dbe3ea" stroke="#64748b" strokeWidth={1.5} style={{ pointerEvents: "none" }} />

        <circle cx={43} cy={5} r={18} fill="#f8fafc" stroke={motorStroke} strokeWidth={tapSelected ? 3.6 : 2.4} style={{ pointerEvents: "none" }} />

        <g transform="translate(43 5)" style={{ pointerEvents: "none" }}>
          <g>
            {[0, 90, 180, 270].map((deg) => (
              <path key={deg} d="M 0 -8 C 4.5 -7.5 6.5 -3.5 3.2 -0.8 L 0 0 Z" transform={`rotate(${deg})`} fill={running && online ? "#0ea5e9" : "#94a3b8"} />
            ))}
            <circle r={2.7} fill={running && online ? "#0284c7" : "#64748b"} />
            {running && online && (
              <animateTransform attributeName="transform" type="rotate" from="0 0 0" to="360 0 0" dur="0.9s" repeatCount="indefinite" />
            )}
          </g>
        </g>

        <rect x={-42} y={25} width={94} height={10} rx={3} fill="#e2e8f0" stroke="#64748b" strokeWidth={1.5} style={{ pointerEvents: "none" }} />

        <g style={{ pointerEvents: "none" }}>
          <rect x={-42} y={41} width={22} height={17} rx={7} fill="#e2e8f0" stroke="#94a3b8" strokeWidth={1} />
          <text x={-31} y={53} textAnchor="middle" fill="#334155" style={{ fontSize: 10, fontWeight: 950 }}>{controlMode}</text>
          <text x={-12} y={53} textAnchor="start" fill={hasEstimatedCurrent && !hasDirectCurrent ? "#0369a1" : "#334155"} style={{ fontSize: 11, fontWeight: 900 }}>
            {currentText}
          </text>
        </g>
      </g>
    );
  }

  return (
    <g
      transform={`translate(${n.x}, ${n.y})`}
      {...interactionProps}
      style={{
        cursor: tapConnectMode ? "crosshair" : enabled ? "move" : "default",
        touchAction: "none",
      }}
      opacity={online ? 1 : 0.58}
    >
      <text x={48} y={-18} textAnchor="start" fill="#1e293b" style={{ fontSize: 14, fontWeight: 850, pointerEvents: "none" }}>
        {name}
      </text>

      <rect x={-18} y={-36} width={36} height={48} rx={10} fill={motorFill} stroke={motorStroke} strokeWidth={tapSelected ? 4 : 2.2} />
      <path d="M -18 -28 Q 0 -45 18 -28 L 18 -21 L -18 -21 Z" fill="#dbe3ea" stroke="#64748b" strokeWidth={1.5} style={{ pointerEvents: "none" }} />
      <circle cx={0} cy={20} r={17} fill="#f8fafc" stroke={motorStroke} strokeWidth={tapSelected ? 3.6 : 2.3} style={{ pointerEvents: "none" }} />

      <g transform="translate(0 20)" style={{ pointerEvents: "none" }}>
        <g>
          {[0, 90, 180, 270].map((deg) => (
            <path key={deg} d="M 0 -7.5 C 4.2 -7 6.2 -3.3 3.0 -0.8 L 0 0 Z" transform={`rotate(${deg})`} fill={running && online ? "#0ea5e9" : "#94a3b8"} />
          ))}
          <circle r={2.7} fill={running && online ? "#0284c7" : "#64748b"} />
          {running && online && (
            <animateTransform attributeName="transform" type="rotate" from="0 0 0" to="360 0 0" dur="0.9s" repeatCount="indefinite" />
          )}
        </g>
      </g>

      <rect x={-27} y={39} width={54} height={10} rx={3} fill="#e2e8f0" stroke="#64748b" strokeWidth={1.5} style={{ pointerEvents: "none" }} />

      <g style={{ pointerEvents: "none" }}>
        <rect x={-30} y={54} width={22} height={17} rx={7} fill="#e2e8f0" stroke="#94a3b8" strokeWidth={1} />
        <text x={-19} y={66} textAnchor="middle" fill="#334155" style={{ fontSize: 10, fontWeight: 950 }}>{controlMode}</text>
        <text x={-2} y={66} textAnchor="start" fill={hasEstimatedCurrent && !hasDirectCurrent ? "#0369a1" : "#334155"} style={{ fontSize: 11, fontWeight: 900 }}>
          {currentText}
        </text>
      </g>
    </g>
  );
}
