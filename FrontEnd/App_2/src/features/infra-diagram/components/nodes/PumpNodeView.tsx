import React from "react";
import useNodeDragCommon from "../../useNodeDragCommon";
import type { PumpNode } from "../../types";
import { API_BASE } from "@/lib/api";

type PumpOrientation = "vertical" | "horizontal";

type PumpDiagnostic = {
  pump_id?: number;
  analyzer_id?: number;
  state?: string | null;
  official?: {
    current_a?: number | null;
    i_l1_a?: number | null;
    i_l2_a?: number | null;
    i_l3_a?: number | null;
    startup_type?: string | null;
    measured_at?: string | null;
  };
  model?: {
    current_a?: number | null;
    current_error_pct?: number | null;
    power_ref_kw?: number | null;
    valid_starts?: number | null;
  };
  live?: {
    power_kw?: number | null;
    power_deviation_pct?: number | null;
    power_status?: string | null;
    power_reason?: string | null;
    quality?: string | null;
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

function fmt(v: any, decimals = 1) {
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(decimals) : "--";
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

  const name = typeof n.name === "string" && n.name.trim() ? n.name.trim() : `Bomba ${n.id}`;
  const state = String(n.state || "").toLowerCase();
  const running = ["run", "running", "on", "1", "true"].includes(state);
  const online = n.online === true;
  const maintenance = (n as any).in_maintenance === true;
  const controlMode = "M";

  const pumpId = React.useMemo(() => extractPumpId(n), [n]);
  const [diagnostic, setDiagnostic] = React.useState<PumpDiagnostic | null>(null);

  React.useEffect(() => {
    if (!pumpId) {
      setDiagnostic(null);
      return;
    }

    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let ctrl: AbortController | null = null;

    async function tick() {
      ctrl = new AbortController();
      try {
        const r = await fetch(`${API_BASE}/components/network_analyzers/pump-diagnostic/${pumpId}`, {
          method: "GET",
          headers: { Accept: "application/json" },
          cache: "no-store",
          signal: ctrl.signal,
        });
        if (!alive) return;
        if (!r.ok) setDiagnostic(null);
        else setDiagnostic((await r.json()) as PumpDiagnostic);
      } catch {
        if (alive) setDiagnostic(null);
      } finally {
        if (alive) timer = setTimeout(tick, 15000);
      }
    }

    tick();
    return () => {
      alive = false;
      ctrl?.abort();
      if (timer) clearTimeout(timer);
    };
  }, [pumpId]);

  const officialCurrent = Number(diagnostic?.official?.current_a ?? NaN);
  const hasOfficialCurrent = Number.isFinite(officialCurrent) && officialCurrent > 0;
  const powerRef = Number(diagnostic?.model?.power_ref_kw ?? NaN);
  const livePower = Number(diagnostic?.live?.power_kw ?? NaN);
  const deviationPct = Number(diagnostic?.live?.power_deviation_pct ?? NaN);
  const powerStatus = String(diagnostic?.live?.power_status ?? "monitoring");
  const abnormalPower = running && (powerStatus === "low_power" || powerStatus === "high_power");

  const currentText = hasOfficialCurrent ? `I ref. ${officialCurrent.toFixed(1)} A` : "I ref. -- A";

  const motorFill = !online
    ? "#cbd5e1"
    : maintenance
    ? "#fbbf24"
    : running
    ? abnormalPower
      ? "#dc2626"
      : "#22c55e"
    : "#b8c2cc";

  const motorStroke = tapSelected
    ? "#0ea5e9"
    : !online
    ? "#94a3b8"
    : maintenance
    ? "#d97706"
    : running
    ? abnormalPower
      ? "#991b1b"
      : "#15803d"
    : "#64748b";

  const fanColor = !online
    ? "#94a3b8"
    : running
    ? abnormalPower
      ? "#ef4444"
      : "#16a34a"
    : "#94a3b8";

  const statusText = abnormalPower
    ? powerStatus === "low_power"
      ? "ALERTA: potencia baja"
      : "ALERTA: potencia alta"
    : running
    ? "En marcha · normal"
    : "Detenida";

  const tipLines = [
    `ID: ${n.id}`,
    `Estado: ${statusText}`,
    `Comunicación: ${online ? "Online" : "Offline"}`,
    `Modo: Manual`,
    hasOfficialCurrent ? `Corriente oficial (pinza): ${officialCurrent.toFixed(1)} A` : "Corriente oficial: sin referencia",
    diagnostic?.official?.i_l1_a != null && diagnostic?.official?.i_l2_a != null && diagnostic?.official?.i_l3_a != null
      ? `Fases ref.: ${fmt(diagnostic.official.i_l1_a)} / ${fmt(diagnostic.official.i_l2_a)} / ${fmt(diagnostic.official.i_l3_a)} A`
      : "",
    diagnostic?.official?.startup_type ? `Arranque: ${diagnostic.official.startup_type}` : "",
    Number.isFinite(powerRef) ? `Potencia normal: ${powerRef.toFixed(1)} kW` : "",
    Number.isFinite(livePower) ? `Potencia inferida último arranque: ${livePower.toFixed(1)} kW` : "",
    Number.isFinite(deviationPct)
      ? `Desvío de potencia: ${deviationPct >= 0 ? "+" : ""}${deviationPct.toFixed(1)}%`
      : "",
    diagnostic?.live?.power_reason || "",
    diagnostic?.model?.current_a != null && hasOfficialCurrent
      ? `Modelo ABB corriente: ${fmt(diagnostic.model.current_a)} A · error ${fmt(diagnostic.model.current_error_pct)}%`
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
    onMouseEnter: (e: React.MouseEvent<SVGGElement>) => showTip(e, { title: name, lines: tipLines }),
    onMouseMove: (e: React.MouseEvent<SVGGElement>) => showTip(e, { title: name, lines: tipLines }),
    onMouseLeave: hideTip,
    onClick: handleClick,
  };

  const fan = (cx: number, cy: number) => (
    <g transform={`translate(${cx} ${cy})`} style={{ pointerEvents: "none" }}>
      <g>
        {[0, 90, 180, 270].map((deg) => (
          <path
            key={deg}
            d="M 0 -8 C 4.5 -7.5 6.5 -3.5 3.2 -0.8 L 0 0 Z"
            transform={`rotate(${deg})`}
            fill={running && online ? fanColor : "#94a3b8"}
          />
        ))}
        <circle r={2.7} fill={running && online ? fanColor : "#64748b"} />
        {running && online && (
          <animateTransform attributeName="transform" type="rotate" from="0 0 0" to="360 0 0" dur="0.9s" repeatCount="indefinite" />
        )}
      </g>
    </g>
  );

  if (orientation === "horizontal") {
    return (
      <g
        transform={`translate(${n.x}, ${n.y})`}
        {...interactionProps}
        style={{ cursor: tapConnectMode ? "crosshair" : enabled ? "move" : "default", touchAction: "none" }}
        opacity={online ? 1 : 0.58}
      >
        <text x={72} y={4} textAnchor="start" fill="#1e293b" style={{ fontSize: 14, fontWeight: 850, pointerEvents: "none" }}>{name}</text>
        <rect x={-48} y={-16} width={70} height={34} rx={12} fill={motorFill} stroke={motorStroke} strokeWidth={abnormalPower || tapSelected ? 3.2 : 2.3} />
        {[-30, -14, 2].map((x) => <line key={x} x1={x} y1={-13} x2={x} y2={15} stroke="#fff" strokeWidth={2} opacity={0.25} />)}
        <rect x={22} y={-9} width={12} height={18} rx={4} fill="#dbe3ea" stroke="#64748b" strokeWidth={1.5} />
        <circle cx={43} cy={5} r={18} fill="#f8fafc" stroke={motorStroke} strokeWidth={abnormalPower || tapSelected ? 3.2 : 2.4} />
        {fan(43, 5)}
        <rect x={-42} y={25} width={94} height={10} rx={3} fill="#e2e8f0" stroke="#64748b" strokeWidth={1.5} />
        <g style={{ pointerEvents: "none" }}>
          <rect x={-42} y={41} width={22} height={17} rx={7} fill="#e2e8f0" stroke="#94a3b8" strokeWidth={1} />
          <text x={-31} y={53} textAnchor="middle" fill="#334155" style={{ fontSize: 10, fontWeight: 950 }}>{controlMode}</text>
          <text x={-12} y={53} textAnchor="start" fill={abnormalPower ? "#b91c1c" : running ? "#166534" : "#334155"} style={{ fontSize: 10.5, fontWeight: 900 }}>{currentText}</text>
        </g>
      </g>
    );
  }

  return (
    <g
      transform={`translate(${n.x}, ${n.y})`}
      {...interactionProps}
      style={{ cursor: tapConnectMode ? "crosshair" : enabled ? "move" : "default", touchAction: "none" }}
      opacity={online ? 1 : 0.58}
    >
      <text x={48} y={-18} textAnchor="start" fill="#1e293b" style={{ fontSize: 14, fontWeight: 850, pointerEvents: "none" }}>{name}</text>
      <rect x={-18} y={-36} width={36} height={48} rx={10} fill={motorFill} stroke={motorStroke} strokeWidth={abnormalPower || tapSelected ? 3.2 : 2.2} />
      <path d="M -18 -28 Q 0 -45 18 -28 L 18 -21 L -18 -21 Z" fill="#dbe3ea" stroke="#64748b" strokeWidth={1.5} />
      <circle cx={0} cy={20} r={17} fill="#f8fafc" stroke={motorStroke} strokeWidth={abnormalPower || tapSelected ? 3.2 : 2.3} />
      {fan(0, 20)}
      <rect x={-27} y={39} width={54} height={10} rx={3} fill="#e2e8f0" stroke="#64748b" strokeWidth={1.5} />
      <g style={{ pointerEvents: "none" }}>
        <rect x={-30} y={54} width={22} height={17} rx={7} fill="#e2e8f0" stroke="#94a3b8" strokeWidth={1} />
        <text x={-19} y={66} textAnchor="middle" fill="#334155" style={{ fontSize: 10, fontWeight: 950 }}>{controlMode}</text>
        <text x={-2} y={66} textAnchor="start" fill={abnormalPower ? "#b91c1c" : running ? "#166534" : "#334155"} style={{ fontSize: 10.5, fontWeight: 900 }}>{currentText}</text>
      </g>
    </g>
  );
}
