import PumpHoverArea from "../PumpHoverArea";
import TankPumpBlockView from "./TankPumpBlockView";
import { isCompactTank } from "../../equipmentAppearance";
import React from "react";
import useNodeDragCommon from "../../useNodeDragCommon";
import { toNumber } from "../../layout";
import type { TankNode, TankCategory, PumpNode } from "../../types";
import { treatmentPoolGeometry, tankPortPosition, poolPortOutside } from "../../tankGeometry";

function hasAlarmValue(v: any) {
  if (v == null) return false;
  const s = String(v).trim().toLowerCase();
  return s !== "" && !["sin alarma", "ok", "normal", "none"].includes(s);
}

export default function TankNodeView({
  n,
  hideHeading = false,
  mountedPump,
  connectedPorts = [],
  getPos,
  setPos,
  onDragEnd,
  showTip,
  hideTip,
  enabled = true,
  onClick,
}: {
  n: TankNode & {
    name?: string | null;
    categoria?: TankCategory | null;
    servicio?: "agua" | "cargaderos" | "cloacas" | null;
    chlorine_mg_l?: number | string | null;
    ph?: number | string | null;
  };
  hideHeading?: boolean;
  mountedPump?: PumpNode;
  connectedPorts?: string[];
  getPos: any;
  setPos: any;
  onDragEnd: () => void;
  showTip: (
    e: React.MouseEvent,
    content: { title: string; lines: string[] }
  ) => void;
  hideTip: () => void;
  enabled?: boolean;
  onClick?: () => void;
}) {
  const drag = useNodeDragCommon(
    n,
    getPos,
    setPos,
    onDragEnd,
    hideTip,
    enabled
  );

  const category: TankCategory = n.categoria ?? "tanque";
  const isAeration = category === "pileta_aireacion";
  const isSedimentation = category === "pileta_sedimentacion";
  const isChlorination = category === "pileta_cloracion";
  const isTreatmentPool = isAeration || isSedimentation || isChlorination;

  const servicio =
    (n as any).servicio === "cargaderos"
      ? "cargaderos"
      : (n as any).servicio === "cloacas"
      ? "cloacas"
      : "agua";

  const servicioLabel =
    servicio === "cargaderos"
      ? "CARGADEROS"
      : servicio === "cloacas"
      ? "CLOACAS"
      : "AGUA";

  const isCloacas = servicio === "cloacas";

  const isOnline = n.online === true;
  const rawAlarm = String(n.alarma || "").toLowerCase();
  const critical = ["critico", "crítico", "critical"].includes(rawAlarm);
  const warning = ["alerta", "warning", "warn"].includes(rawAlarm);
  const hasAlarm = hasAlarmValue(n.alarma);

  const levelRaw =
    typeof n.level_pct === "number"
      ? n.level_pct
      : toNumber(n.level_pct);

  const level = Math.max(0, Math.min(100, levelRaw ?? 0));
  const chlorineRaw = Number((n as any).chlorine_mg_l);
  const phRaw = Number((n as any).ph);

  const chlorineText =
    Number.isFinite(chlorineRaw) ? `${chlorineRaw.toFixed(2)} mg/L` : "-- mg/L";

  const chlorineValueText =
    Number.isFinite(chlorineRaw) ? chlorineRaw.toFixed(2) : "--";
  const phText =
    Number.isFinite(phRaw) ? phRaw.toFixed(2) : "--";

  const name =
    typeof n.name === "string" && n.name.trim()
      ? n.name.trim()
      : category === "pozo"
      ? `Pozo ${n.id}`
      : `Tanque ${n.id}`;

  const stroke = !isOnline
    ? "#94a3b8"
    : critical
    ? "#ef4444"
    : warning
    ? "#f59e0b"
    : "#3b82f6";

  const tipLines = [
    `ID: ${n.id ?? "—"}`,
    `Tipo: ${category === "pozo" ? "Pozo" : "Tanque"}`,
    `Nivel: ${level.toFixed(0)}%`,
    `Estado: ${isOnline ? "Online" : "Sin comunicación"}`,
    hasAlarm ? `Alarma: ${n.alarma}` : "Alarma: no",
  ];

  if (["tank:25", "tank:27"].includes(n.id) && mountedPump) {
    return <TankPumpBlockView n={n} pump={mountedPump} getPos={getPos} setPos={setPos}
      onDragEnd={onDragEnd} showTip={showTip} hideTip={hideTip} enabled={enabled} onClick={onClick} />;
  }

  // Piletas abiertas, en planta. Sin lectura no se representa un nivel de 0%.
  if (isTreatmentPool) {
    const { poolW, poolH, W, H, px, py } = treatmentPoolGeometry(category)!;
    const validLevel = levelRaw !== null && Number.isFinite(levelRaw);
    const levelText = validLevel ? `${level.toFixed(0)}%` : "—";
    const poolStroke = critical ? "#ef4444" : warning ? "#f59e0b" : "#64748b";
    const poolType = isAeration ? "aireación" : isChlorination ? "cloración" : "sedimentación";
    const poolTip = [
      `Tipo: Pileta de ${poolType}`,
      `Nivel: ${validLevel ? levelText : "Sin datos"}`,
      `Estado: ${isOnline ? "Online" : "Sin comunicación"}`,
      ...(mountedPump ? [`Bomba: ${mountedPump.online !== true ? "Sin comunicación" : ["run", "running", "on", "1", "true"].includes(String(mountedPump.state).toLowerCase()) ? "En marcha" : "Detenida"}`] : []),
      ...(hasAlarm ? [`Alarma: ${n.alarma}`] : []),
    ];
    return (
      <g
        transform={`translate(${n.x - W / 2}, ${n.y - H / 2})`}
        onPointerDown={drag.onPointerDown}
        onPointerMove={drag.onPointerMove}
        onPointerUp={drag.onPointerUp}
        onMouseEnter={(e) => showTip(e, { title: name, lines: poolTip })}
        onMouseMove={(e) => showTip(e, { title: name, lines: poolTip })}
        onMouseLeave={hideTip}
        onClick={onClick}
        style={{ cursor: enabled ? "move" : "default" }}
        data-role="treatment-pool"
      >
        <title>{`${name} · ${validLevel ? levelText : "Sin datos"}`}</title>
        <text x={W / 2} y={22} textAnchor="middle" fill="#0f172a" style={{ fontSize: 18, fontWeight: 850, pointerEvents: "none" }}>{name}</text>
        <text x={W / 2} y={40} textAnchor="middle" fill={isChlorination ? "#7c3aed" : "#15803d"} style={{ fontSize: 10, fontWeight: 800, letterSpacing: 0.6, pointerEvents: "none" }}>
          {`${poolType.toUpperCase()} · CLOACAS`}
        </text>
        <rect x={px} y={py} width={poolW} height={poolH} rx={3} fill="#e2e8f0" stroke={poolStroke} strokeWidth={3} />
        <rect x={px + 10} y={py + 10} width={poolW - 20} height={poolH - 20} rx={1} fill={isChlorination ? "#f5f3ff" : "#f0fdf4"} stroke="#94a3b8" strokeWidth={1.5} />
        {validLevel && (
          <rect x={px + 11} y={py + 10 + (poolH - 20) * (1 - level / 100)} width={poolW - 22} height={(poolH - 20) * level / 100} fill={isChlorination ? "#ddd6fe" : "#bbf7d0"} />
        )}
        {isAeration ? (
          <g stroke="#86b59a" fill="none" strokeWidth={1.5} style={{ pointerEvents: "none" }}>
            {[0, 1, 2].map((row) => [0, 1, 2].map((col) => (
              <g key={`${row}-${col}`} transform={`translate(${px + 45 + col * 65}, ${py + 40 + row * 65})`}>
                <circle r={7} /><circle cx={10} cy={-11} r={3} /><circle cx={-9} cy={-16} r={2} />
              </g>
            )))}
          </g>
        ) : isChlorination ? (
          <g stroke="#a78bfa" strokeWidth={4} fill="none" style={{ pointerEvents: "none" }}>
            {/* Símbolo de cámara de contacto; no representa dimensiones de obra. */}
            {[0, 1, 2, 3].map((i) => (
              <line key={i} x1={px + 70 + i * 70} x2={px + 70 + i * 70} y1={py + (i % 2 === 0 ? 11 : 40)} y2={py + poolH - (i % 2 === 0 ? 40 : 11)} />
            ))}
            <text x={W / 2} y={py + 30} textAnchor="middle" stroke="none" fill="#7c3aed" style={{ fontSize: 16, fontWeight: 800 }}>Cl₂</text>
          </g>
        ) : (
          <g stroke="#86b59a" strokeWidth={2} style={{ pointerEvents: "none" }}>
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <line key={i} x1={px + 42 + i * 40} y1={py + 25} x2={px + 24 + i * 40} y2={py + poolH - 25} />
            ))}
          </g>
        )}
        <rect x={W / 2 - 48} y={py + poolH / 2 - 23} width={96} height={46} rx={8} fill="#ffffff" fillOpacity={0.95} stroke="#cbd5e1" />
        <text x={W / 2} y={py + poolH / 2 + 10} textAnchor="middle" fill="#0f172a" style={{ fontSize: 29, fontWeight: 900, pointerEvents: "none" }}>{levelText}</text>
        {[...new Set(connectedPorts)].map((portId) => {
          const endpoint = tankPortPosition(n, portId);
          const outside = poolPortOutside(n, portId);
          if (!outside) return null;
          const x0 = n.x - W / 2;
          const y0 = n.y - H / 2;
          const d = `M ${outside.x - x0} ${outside.y - y0} L ${endpoint.x - x0} ${endpoint.y - y0}`;
          return (
            <g key={portId} data-role="pool-pipe-connection" style={{ pointerEvents: "none" }}>
              <path d={d} fill="none" stroke="#0f172a" strokeWidth={10} strokeLinecap="round" opacity={0.55} />
              <path d={d} fill="none" stroke="#cbd5e1" strokeWidth={7} strokeLinecap="round" />
              <path d={d} fill="none" stroke="#ffffff" strokeWidth={2.2} strokeLinecap="round" opacity={0.45} />
              <circle cx={endpoint.x - x0} cy={endpoint.y - y0} r={3.6} fill="#64748b" />
              <circle cx={endpoint.x - x0} cy={endpoint.y - y0} r={2.2} fill="#e2e8f0" />
            </g>
          );
        })}
        <circle cx={px + 17} cy={py + poolH + 23} r={4} fill={isOnline ? "#22c55e" : "#94a3b8"} />
        <text x={px + 28} y={py + poolH + 27} fill="#64748b" style={{ fontSize: 11, fontWeight: 700, pointerEvents: "none" }}>
          {isOnline ? "Online" : validLevel ? "Sin comunicación" : "Sin datos"}
        </text>
      </g>
    );
  }

  // ============================================================
  // POZO GRANDE
  // ============================================================
  if (category === "pozo") {
    const W = 420;
    const H = 330;

    const shaftX = 60;
    const shaftY = 62;
    const shaftW = 300;
    const shaftH = 225;

    const waterH = shaftH * (level / 100);
    const waterY = shaftY + shaftH - waterH;

    const clipId = `well-large-${String(n.id).replace(
      /[^a-zA-Z0-9_-]/g,
      "_"
    )}`;

    return (
      <g
        transform={`translate(${n.x - W / 2}, ${n.y - H / 2})`}
        onPointerDown={drag.onPointerDown}
        onPointerMove={drag.onPointerMove}
        onPointerUp={drag.onPointerUp}
        onMouseEnter={(e) =>
          showTip(e, { title: name, lines: tipLines })
        }
        onMouseMove={(e) =>
          showTip(e, { title: name, lines: tipLines })
        }
        onMouseLeave={hideTip}
        onClick={onClick}
        style={{ cursor: enabled ? "move" : "default" }}
        opacity={isOnline ? 1 : 0.58}
      >
        <defs>
          <clipPath id={clipId}>
            <rect
              x={shaftX}
              y={shaftY}
              width={shaftW}
              height={shaftH}
              rx={24}
            />
          </clipPath>

          <linearGradient id={`wellSteel-${n.id}`} x1="0" x2="1">
            <stop offset="0%" stopColor="#cbd5e1" />
            <stop offset="28%" stopColor="#f8fafc" />
            <stop offset="68%" stopColor="#eef2f7" />
            <stop offset="100%" stopColor="#94a3b8" />
          </linearGradient>
        </defs>

        {/* Nombre */}
        {!hideHeading && <>
        <text
          x={W / 2}
          y={24}
          textAnchor="middle"
          fill="#0f172a"
          style={{
            fontSize: 20,
            fontWeight: 900,
            pointerEvents: "none",
          }}
        >
          {name}
        </text>

        <text
          x={W / 2}
          y={43}
          textAnchor="middle"
          fill={isCloacas ? "#15803d" : "#64748b"}
          style={{ fontSize: 10, fontWeight: 900, letterSpacing: 0.6, pointerEvents: "none" }}
        >
          {`POZO · ${servicioLabel}`}
        </text>

        </>}
        {/* Cabezal */}
        <ellipse
          cx={W / 2}
          cy={57}
          rx={154}
          ry={18}
          fill={isCloacas ? "#dcfce7" : `url(#wellSteel-${n.id})`}
          stroke="#64748b"
          strokeWidth={2.4}
        />

        {/* Casing */}
        <rect
          x={shaftX}
          y={shaftY}
          width={shaftW}
          height={shaftH}
          rx={24}
          fill={isCloacas ? "#dcfce7" : `url(#wellSteel-${n.id})`}
          stroke={stroke}
          strokeWidth={3}
        />

        {/* Agua */}
        <g clipPath={`url(#${clipId})`}>
          <rect
            x={shaftX}
            y={waterY}
            width={shaftW}
            height={waterH}
            fill={isCloacas ? "#22c55e" : "#60a5fa"}
            opacity={0.96}
          />
          <rect
            x={shaftX}
            y={waterY}
            width={shaftW}
            height={6}
            fill={isCloacas ? "#15803d" : "#2563eb"}
            opacity={0.72}
          />
        </g>

        {/* Base */}
        <ellipse
          cx={W / 2}
          cy={shaftY + shaftH}
          rx={148}
          ry={15}
          fill="#cbd5e1"
          stroke="#64748b"
          strokeWidth={2}
        />

        {/* Placa nivel */}
        <rect
          x={W / 2 - 48}
          y={142}
          width={96}
          height={54}
          rx={11}
          fill="#f8fafc"
          stroke="#cbd5e1"
          strokeWidth={1.4}
          opacity={0.94}
        />

        <text
          x={W / 2}
          y={179}
          textAnchor="middle"
          fill="#0f172a"
          style={{
            fontSize: 32,
            fontWeight: 950,
            pointerEvents: "none",
          }}
        >
          {level.toFixed(0)}%
        </text>

        <g data-role="well-quality" style={{ pointerEvents: "none" }}>
          <g transform={`translate(${W - 154}, 250)`}>
            <rect
              x={0}
              y={0}
              width={164}
              height={44}
              rx={10}
              fill="#ffffff"
              fillOpacity={0.98}
              stroke="#94a3b8"
              strokeWidth={1.15}
            />

            <text
              x={12}
              y={16}
              fill="#64748b"
              style={{ fontSize: 9, fontWeight: 950, letterSpacing: 0.4 }}
            >
              CR
            </text>

            <text
              x={12}
              y={36}
              fill="#0f172a"
              style={{ fontSize: 23, fontWeight: 950 }}
            >
              {chlorineValueText}
            </text>

            <text
              x={60}
              y={36}
              fill="#64748b"
              style={{ fontSize: 8, fontWeight: 800 }}
            >
              mg/L
            </text>

            <line
              x1={84}
              y1={8}
              x2={84}
              y2={37}
              stroke="#e2e8f0"
              strokeWidth={1}
            />

            <text
              x={96}
              y={16}
              fill="#64748b"
              style={{ fontSize: 9, fontWeight: 950, letterSpacing: 0.4 }}
            >
              pH
            </text>

            <text
              x={96}
              y={36}
              fill="#0f172a"
              style={{ fontSize: 23, fontWeight: 950 }}
            >
              {phText}
            </text>
          </g>
        </g>



        

        {/* Estado */}
        <circle
          cx={82}
          cy={82}
          r={6}
          fill={isOnline ? "#22c55e" : "#94a3b8"}
        />

        {hasAlarm && (
          <circle
            cx={W - 82}
            cy={82}
            r={7}
            fill={critical ? "#ef4444" : "#f59e0b"}
          />
        )}

        {/* sin puntos visibles: aparecen sólo en Editar + Conectar */}
      </g>
    );
  }

  // ============================================================
  // TANQUE INDUSTRIAL (igual que V10)
  // ============================================================
  if (isCompactTank(n) && category === "tanque") {
    const hasLevel = levelRaw != null && Number.isFinite(levelRaw);
    const compactLines = [
      `Nivel: ${hasLevel ? `${level.toFixed(0)}%` : "Sin datos"}`,
      `Estado: ${hasLevel ? (isOnline ? "Online" : "Sin comunicación") : "Sin datos"}`,
      ...(hasAlarm ? [`Alarma: ${n.alarma}`] : []),
    ];
    const waterHeight = 78 * level / 100;
    const clip = `compact-${n.id.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
    return (
      <g transform={`translate(${n.x}, ${n.y})`}
        onPointerDown={drag.onPointerDown} onPointerMove={drag.onPointerMove} onPointerUp={drag.onPointerUp}
        onMouseEnter={(e) => showTip(e, { title: name, lines: compactLines })}
        onMouseMove={(e) => showTip(e, { title: name, lines: compactLines })}
        onMouseLeave={hideTip} onClick={onClick}
        style={{ cursor: enabled ? "move" : "default" }} data-role={mountedPump ? "tank-with-pump" : "compact-tank"}>
        <title>{name}</title>
        <rect x={-72} y={-151} width={144} height={236} rx={12} fill="none" stroke="none" pointerEvents="all" />
        <g style={{ pointerEvents: "none" }}>
        <text x={0} y={mountedPump ? -132 : -68} textAnchor="middle" fill="#1e293b" style={{ fontSize: 12, fontWeight: 800 }}>{name}</text>
        <path d="M -50 -42 L -50 42 A 50 10 0 0 0 50 42 L 50 -42 Z" fill="#f1f5f9" stroke={stroke} strokeWidth={2} />
        <defs><clipPath id={clip}><rect x={-47} y={-38} width={94} height={78} /></clipPath></defs>
        {hasLevel && <g clipPath={`url(#${clip})`}>
          <rect x={-47} y={40 - waterHeight} width={94} height={waterHeight} fill="#bae6fd" />
          <path d={`M -47 ${40 - waterHeight} L 47 ${40 - waterHeight}`} stroke="#38bdf8" strokeWidth={2} />
        </g>}
        {mountedPump && <path d="M 0 -59 L 0 -42" stroke="#64748b" strokeWidth={5} />}
        <ellipse cx={0} cy={-42} rx={50} ry={10} fill="#e2e8f0" stroke={stroke} strokeWidth={2} />
        {mountedPump && <g transform="translate(0 -90) scale(0.65)" data-role="integrated-pump">
          <rect x={-18} y={-36} width={36} height={48} rx={10}
            fill={mountedPump.online !== true ? "#cbd5e1" : ["run", "running", "on", "1", "true"].includes(String(mountedPump.state).toLowerCase()) ? "#22c55e" : "#b8c2cc"} stroke="#64748b" strokeWidth={2} />
          <path d="M -18 -28 Q 0 -45 18 -28" fill="none" stroke="#64748b" strokeWidth={2} />
          <circle cy={20} r={17} fill="#f8fafc" stroke="#64748b" strokeWidth={2} />
          <path d="M -9 20 L 9 20 M 0 11 L 0 29" stroke="#94a3b8" strokeWidth={3} />
          <rect x={-27} y={39} width={54} height={10} rx={3} fill="#e2e8f0" stroke="#64748b" />
        </g>}
        {[-1, 1].map((side) => <g key={side}>
          <path d={`M ${side * 56} 0 L ${side * 44} 0`} stroke="#64748b" strokeWidth={7} strokeLinecap="round" />
          <path d={`M ${side * 56} 0 L ${side * 44} 0`} stroke="#cbd5e1" strokeWidth={4} strokeLinecap="round" />
          <circle cx={side * 44} cy={0} r={4} fill="white" stroke="#64748b" strokeWidth={1.5} />
        </g>)}
        <path d="M -50 42 A 50 10 0 0 0 50 42" fill="none" stroke={stroke} strokeWidth={2} />
        <text x={0} y={6} textAnchor="middle" fill="#334155" style={{ fontSize: 17, fontWeight: 800 }}>{hasLevel ? `${level.toFixed(0)}%` : "—"}</text>
        <text x={0} y={72} textAnchor="middle" fill="#64748b" style={{ fontSize: 10 }}>{hasLevel ? (isOnline ? "Online" : "Sin comunicación") : "Sin datos"}</text>
        </g>
        {mountedPump && <PumpHoverArea pump={mountedPump} x={-22} y={-118} width={44} height={62}
          showTip={showTip} hideTip={hideTip} />}
      </g>
    );
  }

  const W = 300;
  const H = 220;
  const bodyX = 22;
  const bodyY = 50;
  const bodyW = W - 44;
  const bodyH = 144;
  const ellipseH = 24;

  const waterH = bodyH * (level / 100);
  const waterY = bodyY + bodyH - waterH;

  const clipId = `tank-industrial-clip-${String(n.id).replace(
    /[^a-zA-Z0-9_-]/g,
    "_"
  )}`;

  return (
    <g
      transform={`translate(${n.x - W / 2}, ${n.y - H / 2})`}
      onPointerDown={drag.onPointerDown}
      onPointerMove={drag.onPointerMove}
      onPointerUp={drag.onPointerUp}
      onMouseEnter={(e) =>
        showTip(e, { title: name, lines: tipLines })
      }
      onMouseMove={(e) =>
        showTip(e, { title: name, lines: tipLines })
      }
      onMouseLeave={hideTip}
      onClick={onClick}
      style={{ cursor: enabled ? "move" : "default" }}
      opacity={isOnline ? 1 : 0.58}
    >
      <defs>
        <clipPath id={clipId}>
          <rect
            x={bodyX}
            y={bodyY}
            width={bodyW}
            height={bodyH}
            rx={14}
          />
        </clipPath>

        <linearGradient id={`tankSteel-${n.id}`} x1="0" x2="1">
          <stop offset="0%" stopColor="#d6dee7" />
          <stop offset="22%" stopColor="#f8fafc" />
          <stop offset="62%" stopColor="#eef2f7" />
          <stop offset="100%" stopColor="#aeb9c5" />
        </linearGradient>
      </defs>

      <text
        x={W / 2}
        y={22}
        textAnchor="middle"
        fill="#0f172a"
        style={{
          fontSize: 19,
          fontWeight: 850,
          pointerEvents: "none",
        }}
      >
        {name}
      </text>

      <text
        x={W / 2}
        y={40}
        textAnchor="middle"
        fill={isCloacas ? "#15803d" : "#64748b"}
        style={{ fontSize: 10, fontWeight: 900, letterSpacing: 0.6, pointerEvents: "none" }}
      >
        {`TANQUE · ${servicioLabel}`}
      </text>

      <rect
        x={bodyX}
        y={bodyY}
        width={bodyW}
        height={bodyH}
        rx={15}
        fill={isCloacas ? "#dcfce7" : `url(#tankSteel-${n.id})`}
        stroke={stroke}
        strokeWidth={2.8}
      />

      <ellipse
        cx={W / 2}
        cy={bodyY}
        rx={bodyW / 2}
        ry={ellipseH / 2}
        fill="#eef2f7"
        stroke={stroke}
        strokeWidth={2.2}
      />

      <ellipse
        cx={W / 2}
        cy={bodyY + bodyH}
        rx={bodyW / 2}
        ry={ellipseH / 2}
        fill="#cbd5e1"
        stroke={stroke}
        strokeWidth={2}
      />

      <g clipPath={`url(#${clipId})`}>
        <rect
          x={bodyX}
          y={waterY}
          width={bodyW}
          height={waterH}
          fill={isCloacas ? "#22c55e" : "#60a5fa"}
          opacity={0.92}
        />
        <rect
          x={bodyX}
          y={waterY}
          width={bodyW}
          height={5}
          fill={isCloacas ? "#15803d" : "#2563eb"}
          opacity={0.72}
        />
      </g>

      <rect
        x={W / 2 - 50}
        y={104}
        width={100}
        height={44}
        rx={9}
        fill="#f8fafc"
        stroke="#cbd5e1"
        strokeWidth={1.2}
        opacity={0.94}
      />

      <text
        x={W / 2}
        y={135}
        textAnchor="middle"
        fill="#0f172a"
        style={{
          fontSize: 32,
          fontWeight: 950,
          pointerEvents: "none",
        }}
      >
        {level.toFixed(0)}%
      </text>

      <g data-role="tank-quality" style={{ pointerEvents: "none" }}>
        <g transform={`translate(${W - 150}, 172)`}>
          <rect
            x={0}
            y={0}
            width={160}
            height={42}
            rx={10}
            fill="#ffffff"
            fillOpacity={0.98}
            stroke="#94a3b8"
            strokeWidth={1.15}
          />

          {/* CR */}
          <text
            x={12}
            y={15}
            fill="#64748b"
            style={{ fontSize: 9, fontWeight: 950, letterSpacing: 0.4 }}
          >
            CR
          </text>

          <text
            x={12}
            y={34}
            fill="#0f172a"
            style={{ fontSize: 22, fontWeight: 950 }}
          >
            {chlorineValueText}
          </text>

          <text
            x={58}
            y={34}
            fill="#64748b"
            style={{ fontSize: 8, fontWeight: 800 }}
          >
            mg/L
          </text>

          <line
            x1={82}
            y1={7}
            x2={82}
            y2={35}
            stroke="#e2e8f0"
            strokeWidth={1}
          />

          {/* pH */}
          <text
            x={94}
            y={15}
            fill="#64748b"
            style={{ fontSize: 9, fontWeight: 950, letterSpacing: 0.4 }}
          >
            pH
          </text>

          <text
            x={94}
            y={34}
            fill="#0f172a"
            style={{ fontSize: 22, fontWeight: 950 }}
          >
            {phText}
          </text>
        </g>
      </g>


      

      <circle
        cx={38}
        cy={66}
        r={5.5}
        fill={isOnline ? "#22c55e" : "#94a3b8"}
      />

      {hasAlarm && (
        <circle
          cx={W - 38}
          cy={66}
          r={7}
          fill={critical ? "#ef4444" : "#f59e0b"}
        />
      )}
    </g>
  );
}













