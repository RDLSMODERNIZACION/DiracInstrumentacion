import React from "react";
import useNodeDragCommon from "../../useNodeDragCommon";
import type { PumpNode } from "../../types";

type PumpOrientation = "vertical" | "horizontal";

export default function PumpNodeView({
  n,
  getPos,
  setPos,
  onDragEnd,
  showTip,
  hideTip,
  enabled = true,
  onClick,
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

  const running = [
    "run",
    "running",
    "on",
    "1",
    "true",
  ].includes(state);

  const online = n.online === true;
  const maintenance = (n as any).in_maintenance === true;

  const motorFill = !online
    ? "#cbd5e1"
    : maintenance
    ? "#fbbf24"
    : running
    ? "#ef6c35"
    : "#b8c2cc";

  const motorStroke = !online
    ? "#94a3b8"
    : maintenance
    ? "#d97706"
    : running
    ? "#c2410c"
    : "#64748b";

  const metal = online ? "#64748b" : "#94a3b8";

  const statusFill = !online
    ? "#94a3b8"
    : maintenance
    ? "#f59e0b"
    : running
    ? "#16a34a"
    : "#64748b";

  const statusText = !online
    ? "OFFLINE"
    : maintenance
    ? "MANT."
    : running
    ? "ON"
    : "OFF";

  const tipLines = [
    `ID: ${n.id}`,
    `Estado: ${running ? "En marcha" : "Detenida"}`,
    `Comunicación: ${online ? "Online" : "Offline"}`,
    `Montaje: ${orientation === "horizontal" ? "Horizontal" : "Vertical"}`,
  ];

  if (orientation === "horizontal") {
    return (
      <g
        transform={`translate(${n.x}, ${n.y})`}
        onPointerDown={drag.onPointerDown}
        onPointerMove={drag.onPointerMove}
        onPointerUp={drag.onPointerUp}
        onMouseEnter={(e) => showTip(e, { title: name, lines: tipLines })}
        onMouseMove={(e) => showTip(e, { title: name, lines: tipLines })}
        onMouseLeave={hideTip}
        onClick={onClick}
        style={{ cursor: enabled ? "move" : "default" }}
        opacity={online ? 1 : 0.58}
      >
        {/* NOMBRE ADELANTE / DERECHA */}
        <text
          x={72}
          y={4}
          textAnchor="start"
          fill="#1e293b"
          style={{
            fontSize: 14,
            fontWeight: 850,
            pointerEvents: "none",
          }}
        >
          {name}
        </text>

        {/* ENTRADA: lateral derecho */}
        <line
          x1={56}
          y1={12}
          x2={88}
          y2={12}
          stroke={metal}
          strokeWidth={7}
          strokeLinecap="round"
        />
        <circle
          cx={88}
          cy={12}
          r={4.5}
          fill="#f8fafc"
          stroke={metal}
          strokeWidth={1.5}
        />

        {/* SALIDA: vertical superior */}
        <line
          x1={26}
          y1={-20}
          x2={26}
          y2={-54}
          stroke={metal}
          strokeWidth={7}
          strokeLinecap="round"
        />
        <circle
          cx={26}
          cy={-54}
          r={4.5}
          fill="#f8fafc"
          stroke={metal}
          strokeWidth={1.5}
        />

        {/* BASE */}
        <rect
          x={-42}
          y={25}
          width={94}
          height={10}
          rx={3}
          fill="#e2e8f0"
          stroke="#64748b"
          strokeWidth={1.5}
        />

        {/* MOTOR HORIZONTAL */}
        <rect
          x={-48}
          y={-16}
          width={70}
          height={34}
          rx={12}
          fill={motorFill}
          stroke={motorStroke}
          strokeWidth={2.3}
        />

        {/* ALETAS MOTOR */}
        {[-30, -14, 2].map((x) => (
          <line
            key={x}
            x1={x}
            y1={-13}
            x2={x}
            y2={15}
            stroke="#ffffff"
            strokeWidth={2}
            opacity={0.25}
          />
        ))}

        {/* ACOPLE */}
        <rect
          x={22}
          y={-9}
          width={12}
          height={18}
          rx={4}
          fill="#dbe3ea"
          stroke="#64748b"
          strokeWidth={1.5}
        />

        {/* VOLUTA / CUERPO BOMBA */}
        <circle
          cx={43}
          cy={5}
          r={18}
          fill="#f8fafc"
          stroke={motorStroke}
          strokeWidth={2.4}
        />

        {/* IMPULSOR VISIBLE */}
        <g transform="translate(43 5)">
          {[0, 90, 180, 270].map((deg) => (
            <path
              key={deg}
              d="M 0 -11 C 6 -10 9 -5 5 -1 L 0 0 Z"
              transform={`rotate(${deg})`}
              fill={running && online ? "#0ea5e9" : "#94a3b8"}
            />
          ))}
          <circle
            r={3}
            fill={running && online ? "#0284c7" : "#64748b"}
          />

          {/* GIRO CUANDO ESTA ENCENDIDA */}
          {running && online && (
            <animateTransform
              attributeName="transform"
              type="rotate"
              from="0 0 0"
              to="360 0 0"
              dur="0.9s"
              repeatCount="indefinite"
            />
          )}
        </g>

        {/* ESTADO */}
        <rect
          x={-23}
          y={41}
          width={46}
          height={16}
          rx={8}
          fill={statusFill}
        />
        <text
          x={0}
          y={53}
          textAnchor="middle"
          fill="#ffffff"
          style={{
            fontSize: 10,
            fontWeight: 900,
            pointerEvents: "none",
          }}
        >
          {statusText}
        </text>

        {/* LED */}
        <circle
          cx={-39}
          cy={-10}
          r={4}
          fill={
            maintenance
              ? "#f59e0b"
              : !online
              ? "#94a3b8"
              : running
              ? "#22c55e"
              : "#64748b"
          }
        />
      </g>
    );
  }

  // BOMBA VERTICAL
  return (
    <g
      transform={`translate(${n.x}, ${n.y})`}
      onPointerDown={drag.onPointerDown}
      onPointerMove={drag.onPointerMove}
      onPointerUp={drag.onPointerUp}
      onMouseEnter={(e) => showTip(e, { title: name, lines: tipLines })}
      onMouseMove={(e) => showTip(e, { title: name, lines: tipLines })}
      onMouseLeave={hideTip}
      onClick={onClick}
      style={{ cursor: enabled ? "move" : "default" }}
      opacity={online ? 1 : 0.58}
    >
      {/* NOMBRE ADELANTE / DERECHA */}
      <text
        x={48}
        y={-18}
        textAnchor="start"
        fill="#1e293b"
        style={{
          fontSize: 14,
          fontWeight: 850,
          pointerEvents: "none",
        }}
      >
        {name}
      </text>

      {/* ENTRADA LATERAL DERECHA */}
      <line
        x1={28}
        y1={18}
        x2={58}
        y2={18}
        stroke={metal}
        strokeWidth={7}
        strokeLinecap="round"
      />

      {/* SALIDA VERTICAL ARRIBA */}
      <line
        x1={0}
        y1={-44}
        x2={0}
        y2={-72}
        stroke={metal}
        strokeWidth={7}
        strokeLinecap="round"
      />

      {/* BASE */}
      <rect
        x={-27}
        y={39}
        width={54}
        height={10}
        rx={3}
        fill="#e2e8f0"
        stroke="#64748b"
        strokeWidth={1.5}
      />

      {/* MOTOR */}
      <rect
        x={-18}
        y={-36}
        width={36}
        height={48}
        rx={10}
        fill={motorFill}
        stroke={motorStroke}
        strokeWidth={2.2}
      />

      <path
        d="M -18 -28 Q 0 -45 18 -28 L 18 -21 L -18 -21 Z"
        fill="#dbe3ea"
        stroke="#64748b"
        strokeWidth={1.5}
      />

      {/* CUERPO HIDRAULICO */}
      <circle
        cx={0}
        cy={20}
        r={17}
        fill="#f8fafc"
        stroke={motorStroke}
        strokeWidth={2.3}
      />

      {/* IMPULSOR */}
      <g transform="translate(0 20)">
        {[0, 90, 180, 270].map((deg) => (
          <path
            key={deg}
            d="M 0 -10 C 5 -9 8 -4 4 -1 L 0 0 Z"
            transform={`rotate(${deg})`}
            fill={running && online ? "#0ea5e9" : "#94a3b8"}
          />
        ))}
        <circle
          r={3}
          fill={running && online ? "#0284c7" : "#64748b"}
        />

        {running && online && (
          <animateTransform
            attributeName="transform"
            type="rotate"
            from="0 0 0"
            to="360 0 0"
            dur="0.9s"
            repeatCount="indefinite"
          />
        )}
      </g>

      <rect
        x={-23}
        y={54}
        width={46}
        height={16}
        rx={8}
        fill={statusFill}
      />
      <text
        x={0}
        y={66}
        textAnchor="middle"
        fill="#ffffff"
        style={{
          fontSize: 10,
          fontWeight: 900,
          pointerEvents: "none",
        }}
      >
        {statusText}
      </text>
    </g>
  );
}
