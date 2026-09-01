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
    current_a_vector_raw?: number | null;
    current_a_vector_sd?: number | null;
    current_a_direct_raw?: number | null;
    current_a_direct_sd?: number | null;
    current_a_min_theoretical?: number | null;
    current_confidence?: string | null;
    operating_kw_est?: number | null;
    valid_starts?: number | null;
  };
};

type PumpOfficialReference = {
  pump_id?: number;
  pump_name?: string | null;
  measured_at?: string | null;
  source?: string | null;
  i_l1_a?: number | null;
  i_l2_a?: number | null;
  i_l3_a?: number | null;
  i_avg_a?: number | null;
  startup_type?: string | null;
  notes?: string | null;
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

function confidenceLabel(v?: string | null) {
  const s = String(v ?? "").toLowerCase();
  if (s === "high") return "alta";
  if (s === "medium") return "media";
  if (s === "low") return "baja";
  return "insuficiente";
}

function pctDiff(value: number, reference: number) {
  if (!Number.isFinite(value) || !Number.isFinite(reference) || reference === 0) return null;
  return ((value - reference) / reference) * 100;
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
  const [official, setOfficial] = React.useState<PumpOfficialReference | null>(null);

  React.useEffect(() => {
    if (!pumpId) {
      setElectrical(null);
      setOfficial(null);
      return;
    }

    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let ctrl: AbortController | null = null;

    async function tick() {
      ctrl = new AbortController();
      try {
        const [energyRes, referenceRes] = await Promise.all([
          fetch(`${API_BASE}/components/network_analyzers/pump-energy/by-pump/${pumpId}?days=30`, {
            method: "GET",
            headers: { Accept: "application/json" },
            cache: "no-store",
            signal: ctrl.signal,
          }),
          fetch(`${API_BASE}/components/network_analyzers/pump-reference/${pumpId}`, {
            method: "GET",
            headers: { Accept: "application/json" },
            cache: "no-store",
            signal: ctrl.signal,
          }),
        ]);

        if (!alive) return;

        if (energyRes.ok) {
          setElectrical((await energyRes.json()) as PumpElectricalEstimate);
        } else {
          setElectrical(null);
        }

        if (referenceRes.ok) {
          setOfficial((await referenceRes.json()) as PumpOfficialReference);
        } else {
          setOfficial(null);
        }
      } catch {
        if (alive) {
          setElectrical(null);
          setOfficial(null);
        }
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

  const liveCurrent = Number(
    (n as any).current_a ??
    (n as any).amperes ??
    (n as any).current ??
    NaN
  );
  const officialCurrent = Number(official?.i_avg_a ?? NaN);
  const abbEstimatedCurrent = Number(electrical?.pump?.current_a_est ?? NaN);
  const validStarts = Number(electrical?.pump?.valid_starts ?? 0);

  const hasLiveCurrent = Number.isFinite(liveCurrent) && liveCurrent >= 0;
  const hasOfficialCurrent = Number.isFinite(officialCurrent) && officialCurrent > 0;
  const hasAbbEstimatedCurrent = Number.isFinite(abbEstimatedCurrent) && abbEstimatedCurrent > 0;

  const liveVsOfficialPct = hasLiveCurrent && hasOfficialCurrent
    ? pctDiff(liveCurrent, officialCurrent)
    : null;
  const abbVsOfficialPct = hasAbbEstimatedCurrent && hasOfficialCurrent
    ? pctDiff(abbEstimatedCurrent, officialCurrent)
    : null;

  // Solo una corriente EN VIVO fuera de la referencia oficial puede alarmar la bomba.
  // La diferencia ABB vs pinza se usa como control/calibración del modelo, no como falla del equipo.
  const abnormalCurrent = liveVsOfficialPct !== null && Math.abs(liveVsOfficialPct) > 15;

  const currentText = hasLiveCurrent
    ? `I ${liveCurrent.toFixed(1)} A`
    : hasOfficialCurrent
    ? `I ref. ${officialCurrent.toFixed(1)} A`
    : hasAbbEstimatedCurrent
    ? `I est. ≈${abbEstimatedCurrent.toFixed(1)} A`
    : "I -- A";

  const currentColor = abnormalCurrent
    ? "#dc2626"
    : hasOfficialCurrent
    ? "#0f766e"
    : hasAbbEstimatedCurrent
    ? "#0369a1"
    : "#334155";

  const modelStatus = abbVsOfficialPct === null
    ? "sin comparación"
    : Math.abs(abbVsOfficialPct) <= 15
    ? "modelo ABB alineado"
    : Math.abs(abbVsOfficialPct) <= 25
    ? "modelo ABB a revisar"
    : "modelo ABB desviado";

  const currentTooltip = hasLiveCurrent
    ? hasOfficialCurrent
      ? `Corriente en vivo: ${liveCurrent.toFixed(1)} A · referencia oficial: ${officialCurrent.toFixed(1)} A · desvío ${liveVsOfficialPct! >= 0 ? "+" : ""}${liveVsOfficialPct!.toFixed(1)}%${abnormalCurrent ? " (FUERA DE RANGO)" : " (normal)"}`
      : `Corriente en vivo: ${liveCurrent.toFixed(1)} A`
    : hasOfficialCurrent
    ? `Corriente oficial de referencia (pinza): ${officialCurrent.toFixed(1)} A`
    : hasAbbEstimatedCurrent
    ? `Corriente estimada ABB: ${abbEstimatedCurrent.toFixed(1)} A`
    : "Corriente: sin referencia";

  const abbComparisonTooltip = hasOfficialCurrent && hasAbbEstimatedCurrent
    ? `Modelo ABB: ${abbEstimatedCurrent.toFixed(1)} A · vs pinza ${abbVsOfficialPct! >= 0 ? "+" : ""}${abbVsOfficialPct!.toFixed(1)}% · ${modelStatus}`
    : hasAbbEstimatedCurrent
    ? `Modelo ABB: ${abbEstimatedCurrent.toFixed(1)} A · ${validStarts} arranques · confianza ${confidenceLabel(electrical?.pump?.current_confidence)}`
    : "";

  const phaseTooltip = hasOfficialCurrent && (official?.i_l1_a != null || official?.i_l2_a != null || official?.i_l3_a != null)
    ? `Pinza fases: I1 ${official?.i_l1_a ?? "--"} A · I2 ${official?.i_l2_a ?? "--"} A · I3 ${official?.i_l3_a ?? "--"} A`
    : "";

  const motorFill = !online
    ? "#cbd5e1"
    : maintenance
    ? "#fbbf24"
    : running
    ? "#ef6c35"
    : "#b8c2cc";

  const motorStroke = tapSelected
    ? "#0ea5e9"
    : abnormalCurrent
    ? "#dc2626"
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
    phaseTooltip,
    official?.startup_type ? `Arranque: ${official.startup_type}` : "",
    abbComparisonTooltip,
    electrical?.pump?.operating_kw_est != null
      ? `Potencia normal estimada ABB: ${Number(electrical.pump.operating_kw_est).toFixed(1)} kW`
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

        <rect x={-48} y={-16} width={70} height={34} rx={12} fill={motorFill} stroke={motorStroke} strokeWidth={tapSelected || abnormalCurrent ? 3 : 2.3} />

        {[-30, -14, 2].map((x) => (
          <line key={x} x1={x} y1={-13} x2={x} y2={15} stroke="#fff" strokeWidth={2} opacity={0.25} style={{ pointerEvents: "none" }} />
        ))}

        <rect x={22} y={-9} width={12} height={18} rx={4} fill="#dbe3ea" stroke="#64748b" strokeWidth={1.5} style={{ pointerEvents: "none" }} />
        <circle cx={43} cy={5} r={18} fill="#f8fafc" stroke={motorStroke} strokeWidth={tapSelected || abnormalCurrent ? 3 : 2.4} style={{ pointerEvents: "none" }} />

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
          <text x={-12} y={53} textAnchor="start" fill={currentColor} style={{ fontSize: 10.5, fontWeight: 900 }}>
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

      <rect x={-18} y={-36} width={36} height={48} rx={10} fill={motorFill} stroke={motorStroke} strokeWidth={tapSelected || abnormalCurrent ? 3 : 2.2} />
      <path d="M -18 -28 Q 0 -45 18 -28 L 18 -21 L -18 -21 Z" fill="#dbe3ea" stroke="#64748b" strokeWidth={1.5} style={{ pointerEvents: "none" }} />
      <circle cx={0} cy={20} r={17} fill="#f8fafc" stroke={motorStroke} strokeWidth={tapSelected || abnormalCurrent ? 3 : 2.3} style={{ pointerEvents: "none" }} />

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
        <text x={-2} y={66} textAnchor="start" fill={currentColor} style={{ fontSize: 10.5, fontWeight: 900 }}>
          {currentText}
        </text>
      </g>
    </g>
  );
}
