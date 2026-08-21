import React, { useEffect, useMemo, useState } from "react";
import type { UINode } from "../../types";
import { API_BASE } from "@/lib/api";

function toNum(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "string" ? Number(v.replace(",", ".")) : Number(v);
  return Number.isFinite(n) ? n : null;
}

function fmt(v: any, decimals = 1): string {
  const n = toNum(v);
  return n === null ? "--" : n.toFixed(decimals);
}

function firstNum(...values: any[]): number | null {
  for (const v of values) {
    const n = toNum(v);
    if (n !== null) return n;
  }
  return null;
}

function pickSignal(signals: any, keys: string[]) {
  if (!signals) return null;
  for (const key of keys) {
    const v = signals[key];
    if (v === undefined || v === null) continue;

    if (typeof v === "object") {
      const n = firstNum(v.value, v.v, v.latest, v.raw_value);
      if (n !== null) return n;
    }

    const n = toNum(v);
    if (n !== null) return n;
  }
  return null;
}

function rawPick(raw: any, keys: string[]) {
  if (!raw) return null;

  for (const key of keys) {
    const n = firstNum(raw[key], raw?.data?.[key], raw?.values?.[key]);
    if (n !== null) return n;
  }

  return null;
}

function clientToSvg(svg: SVGSVGElement, clientX: number, clientY: number) {
  const pt = svg.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;

  const ctm = svg.getScreenCTM();
  if (!ctm) return null;

  const p = pt.matrixTransform(ctm.inverse());
  return { x: p.x, y: p.y };
}

type LatestReading = {
  id?: number;
  analyzer_id?: number | null;
  ts?: string | null;

  p_kw?: number | null;
  q_kvar?: number | null;
  s_kva?: number | null;
  pf?: number | null;
  hz?: number | null;

  v_l1l2?: number | null;
  v_l2l3?: number | null;
  v_l3l2?: number | null;
  v_l1l3?: number | null;
  v_l3l1?: number | null;

  i_l1?: number | null;
  i_l2?: number | null;
  i_l3?: number | null;

  e_kwh_import?: number | null;
  e_kwh_export?: number | null;
  e_kvarh_import?: number | null;

  raw?: any;
  source?: string | null;
};

function extractAnalyzerId(n: UINode & any): number | null {
  const candidates = [
    n?.analyzer_id,
    n?.analyzerId,
    n?.analyzer?.id,
  ];

  for (const c of candidates) {
    const v = toNum(c);
    if (v !== null && v > 0) return Math.trunc(v);
  }

  const match = String(n?.id ?? "").match(/(\d+)/);
  if (match?.[1]) {
    const v = Number(match[1]);
    if (Number.isFinite(v) && v > 0) return v;
  }

  return null;
}

async function fetchLatestNoScope(
  analyzerId: number,
  signal?: AbortSignal
): Promise<LatestReading> {
  const url = `${API_BASE}/components/network_analyzers/${analyzerId}/latest`;

  const r = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal,
  });

  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(
      `${r.status} ${r.statusText}${txt ? ` - ${txt}` : ""}`
    );
  }

  return (await r.json()) as LatestReading;
}

export default function NetworkAnalyzerNodeView({
  n,
  getPos,
  setPos,
  onDragEnd,
  showTip,
  hideTip,
  enabled,
}: {
  n: UINode & {
    signals?: Record<string, any>;
    analyzer_id?: number | null;
    name?: string | null;
  };

  getPos: (id: string) => { x: number; y: number } | null;
  setPos: (id: string, x: number, y: number) => void;
  onDragEnd?: (x: number, y: number) => void;

  showTip?: (
    e: React.MouseEvent,
    content: { title: string; lines: string[] }
  ) => void;

  hideTip?: () => void;
  enabled: boolean;
  onClick?: () => void;
}) {
  const pos = getPos(n.id) ?? { x: n.x, y: n.y };

  /*
   * SINÓPTICO:
   * solo un cuadrado pequeño con potencia activa.
   */
  const CARD_W = 118;
  const CARD_H = 72;

  /*
   * DETALLE:
   * se abre al hacer click cuando NO estamos editando.
   */
  const PANEL_W = 330;
  const PANEL_H = 250;
  const PANEL_GAP = 14;

  const x0 = pos.x - CARD_W / 2;
  const y0 = pos.y - CARD_H / 2;

  const analyzerId = useMemo(() => extractAnalyzerId(n), [n]);

  const [latest, setLatest] = useState<LatestReading | null>(null);
  const [latestErr, setLatestErr] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const ctrl = new AbortController();

    async function tick() {
      if (!analyzerId) {
        if (alive) {
          setLatest(null);
          setLatestErr("missing analyzerId");
        }
        return;
      }

      try {
        const row = await fetchLatestNoScope(analyzerId, ctrl.signal);

        if (!alive) return;

        setLatest(row);
        setLatestErr(null);
      } catch (err: any) {
        if (!alive) return;
        setLatestErr(err?.message ?? String(err));
      } finally {
        if (!alive) return;
        timer = setTimeout(tick, 2000);
      }
    }

    tick();

    return () => {
      alive = false;
      ctrl.abort();
      if (timer) clearTimeout(timer);
    };
  }, [analyzerId]);

  /*
   * Si entramos a edición, cerramos el detalle.
   * Así no molesta para mover el analizador.
   */
  useEffect(() => {
    if (enabled) setExpanded(false);
  }, [enabled]);

  const ageSec = useMemo(() => {
    if (!latest?.ts) return null;

    const ms = Date.parse(latest.ts);
    if (!Number.isFinite(ms)) return null;

    return Math.max(0, Math.floor((Date.now() - ms) / 1000));
  }, [latest?.ts]);

  const online = ageSec !== null && ageSec <= 180;
  const signals = n.signals ?? null;
  const raw = latest?.raw ?? null;

  const pKW = firstNum(
    latest?.p_kw,
    rawPick(raw, ["p_kw", "power_kw", "active_power_kw", "active_power"]),
    pickSignal(signals, ["p_kw", "power_kw", "kw", "active_power_kw", "active_power", "power"])
  );

  const qKvar = firstNum(
    latest?.q_kvar,
    rawPick(raw, ["q_kvar", "reactive_power_kvar", "reactive_power"]),
    pickSignal(signals, ["q_kvar", "reactive_power_kvar", "reactive_power", "kvar"])
  );

  const sKva = firstNum(
    latest?.s_kva,
    rawPick(raw, ["s_kva", "apparent_power_kva", "apparent_power"]),
    pickSignal(signals, ["s_kva", "apparent_power_kva", "apparent_power", "kva"])
  );

  const pf = firstNum(
    latest?.pf,
    rawPick(raw, ["pf", "cosphi", "cos_phi", "power_factor"]),
    pickSignal(signals, ["pf", "cosphi", "cos_phi", "power_factor"])
  );

  const hz = firstNum(
    latest?.hz,
    rawPick(raw, ["hz", "frequency", "frequency_hz"]),
    pickSignal(signals, ["hz", "frequency", "frequency_hz"])
  );

  const v12 = firstNum(
    latest?.v_l1l2,
    rawPick(raw, ["v_l1l2", "v_l1_l2", "v12"]),
    pickSignal(signals, ["v_l1l2", "v_l1_l2", "v12"])
  );

  const v23 = firstNum(
    latest?.v_l2l3,
    latest?.v_l3l2,
    rawPick(raw, ["v_l2l3", "v_l3l2", "v_l2_l3", "v23"]),
    pickSignal(signals, ["v_l2l3", "v_l3l2", "v_l2_l3", "v23"])
  );

  const v31 = firstNum(
    latest?.v_l3l1,
    latest?.v_l1l3,
    rawPick(raw, ["v_l3l1", "v_l1l3", "v_l3_l1", "v31"]),
    pickSignal(signals, ["v_l3l1", "v_l1l3", "v_l3_l1", "v31"])
  );

  const i1 = firstNum(
    latest?.i_l1,
    rawPick(raw, ["i_l1", "i1", "current_l1"]),
    pickSignal(signals, ["i_l1", "i1", "current_l1"])
  );

  const i2 = firstNum(
    latest?.i_l2,
    rawPick(raw, ["i_l2", "i2", "current_l2"]),
    pickSignal(signals, ["i_l2", "i2", "current_l2"])
  );

  const i3 = firstNum(
    latest?.i_l3,
    rawPick(raw, ["i_l3", "i3", "current_l3"]),
    pickSignal(signals, ["i_l3", "i3", "current_l3"])
  );

  const lowPf = pf !== null && pf < 0.96;

  const name =
    typeof n.name === "string" && n.name.trim()
      ? n.name.trim()
      : "Eléctrico";

  const border = !analyzerId
    ? "#ef4444"
    : !online
    ? "#94a3b8"
    : lowPf
    ? "#f59e0b"
    : "#64748b";

  const powerColor = !online
    ? "#64748b"
    : "#0f172a";

  function onMouseDown(e: React.MouseEvent<SVGGElement>) {
    e.stopPropagation();

    /*
     * OPERACIÓN:
     * click abre/cierra detalle.
     */
    if (!enabled) {
      setExpanded((v) => !v);
      return;
    }

    /*
     * EDICIÓN:
     * comportamiento drag.
     */
    const svg = e.currentTarget.ownerSVGElement;
    if (!svg) return;

    const startSvg = clientToSvg(svg, e.clientX, e.clientY);
    if (!startSvg) return;

    const startPos = getPos(n.id) ?? { x: n.x, y: n.y };
    let last = { x: startPos.x, y: startPos.y };

    function onMove(ev: MouseEvent) {
      const curSvg = clientToSvg(svg, ev.clientX, ev.clientY);
      if (!curSvg) return;

      last = {
        x: startPos.x + (curSvg.x - startSvg.x),
        y: startPos.y + (curSvg.y - startSvg.y),
      };

      setPos(n.id, last.x, last.y);
    }

    function onUp() {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      onDragEnd?.(last.x, last.y);
    }

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  const tipLines = [
    `P: ${fmt(pKW, 1)} kW`,
    pf !== null ? `FP: ${fmt(pf, 2)}${lowPf ? " (bajo)" : ""}` : "",
    online ? "Online" : "Sin comunicación",
  ].filter(Boolean);

  const panelX = x0 + CARD_W + PANEL_GAP;
  const panelY = y0 - 12;

  const row = (
    label: string,
    value: number | null,
    unit: string,
    x: number,
    y: number,
    alarm = false
  ) => (
    <g key={`${label}-${x}-${y}`}>
      <text
        x={x}
        y={y}
        fill="#64748b"
        style={{
          fontSize: 11,
          fontWeight: 800,
          pointerEvents: "none",
        }}
      >
        {label}
      </text>

      <text
        x={x + 43}
        y={y}
        fill={alarm ? "#dc2626" : "#0f172a"}
        style={{
          fontSize: 13,
          fontWeight: 900,
          pointerEvents: "none",
        }}
      >
        {value === null ? "--" : `${fmt(value, unit === "PF" ? 2 : 1)}${unit === "PF" ? "" : ` ${unit}`}`}
      </text>
    </g>
  );

  return (
    <g>
      {/* =====================================================
          CUADRADO PRINCIPAL
          ===================================================== */}
      <g
        onMouseDown={onMouseDown}
        onMouseEnter={(e) =>
          showTip?.(e, {
            title: name,
            lines: tipLines,
          })
        }
        onMouseLeave={() => hideTip?.()}
        style={{
          cursor: enabled ? "move" : "pointer",
        }}
      >
        <rect
          x={x0}
          y={y0}
          width={CARD_W}
          height={CARD_H}
          rx={12}
          fill="#f8fafc"
          stroke={border}
          strokeWidth={lowPf && online ? 2.4 : 1.6}
        />

        {/* Encabezado */}
        <text
          x={x0 + 12}
          y={y0 + 18}
          fill="#64748b"
          style={{
            fontSize: 9,
            fontWeight: 900,
            letterSpacing: 0.7,
            pointerEvents: "none",
          }}
        >
          ⚡ ELÉCTRICO
        </text>

        {/* Potencia */}
        <text
          x={x0 + CARD_W / 2}
          y={y0 + 49}
          textAnchor="middle"
          fill={powerColor}
          style={{
            fontSize: 22,
            fontWeight: 950,
            pointerEvents: "none",
          }}
        >
          {fmt(pKW, 1)}
        </text>

        <text
          x={x0 + CARD_W / 2}
          y={y0 + 63}
          textAnchor="middle"
          fill="#64748b"
          style={{
            fontSize: 10,
            fontWeight: 800,
            pointerEvents: "none",
          }}
        >
          kW
        </text>

        {/* Estado */}
        <circle
          cx={x0 + CARD_W - 12}
          cy={y0 + 13}
          r={4}
          fill={!online ? "#94a3b8" : lowPf ? "#f59e0b" : "#22c55e"}
        />
      </g>

      {/* =====================================================
          DETALLE DESPLEGABLE
          ===================================================== */}
      {expanded && !enabled && (
        <g>
          <rect
            x={panelX}
            y={panelY}
            width={PANEL_W}
            height={PANEL_H}
            rx={14}
            fill="#ffffff"
            stroke="#cbd5e1"
            strokeWidth={1.4}
          />

          <text
            x={panelX + 18}
            y={panelY + 26}
            fill="#0f172a"
            style={{
              fontSize: 16,
              fontWeight: 950,
              pointerEvents: "none",
            }}
          >
            {name}
          </text>

          <text
            x={panelX + PANEL_W - 18}
            y={panelY + 26}
            textAnchor="end"
            fill={online ? "#16a34a" : "#94a3b8"}
            style={{
              fontSize: 10,
              fontWeight: 900,
              pointerEvents: "none",
            }}
          >
            {online ? "ONLINE" : "OFFLINE"}
          </text>

          <line
            x1={panelX + 16}
            y1={panelY + 38}
            x2={panelX + PANEL_W - 16}
            y2={panelY + 38}
            stroke="#e2e8f0"
          />

          {/* Potencias */}
          <text
            x={panelX + 18}
            y={panelY + 59}
            fill="#334155"
            style={{ fontSize: 11, fontWeight: 950 }}
          >
            POTENCIA
          </text>

          {row("P", pKW, "kW", panelX + 18, panelY + 82)}
          {row("Q", qKvar, "kVAr", panelX + 126, panelY + 82)}
          {row("S", sKva, "kVA", panelX + 234, panelY + 82)}

          {row("PF", pf, "PF", panelX + 18, panelY + 104, lowPf)}
          {row("Hz", hz, "Hz", panelX + 126, panelY + 104)}

          {/* Tensiones */}
          <text
            x={panelX + 18}
            y={panelY + 132}
            fill="#334155"
            style={{ fontSize: 11, fontWeight: 950 }}
          >
            TENSIONES
          </text>

          {row("V12", v12, "V", panelX + 18, panelY + 154)}
          {row("V23", v23, "V", panelX + 126, panelY + 154)}
          {row("V31", v31, "V", panelX + 234, panelY + 154)}

          {/* Corrientes */}
          <text
            x={panelX + 18}
            y={panelY + 184}
            fill="#334155"
            style={{ fontSize: 11, fontWeight: 950 }}
          >
            CORRIENTES
          </text>

          {row("I1", i1, "A", panelX + 18, panelY + 207)}
          {row("I2", i2, "A", panelX + 126, panelY + 207)}
          {row("I3", i3, "A", panelX + 234, panelY + 207)}

          {/* Nota inferior */}
          <text
            x={panelX + 18}
            y={panelY + 235}
            fill={lowPf ? "#d97706" : latestErr ? "#dc2626" : "#94a3b8"}
            style={{
              fontSize: 9,
              fontWeight: 800,
              pointerEvents: "none",
            }}
          >
            {lowPf
              ? "Factor de potencia bajo (< 0.96)"
              : latestErr
              ? "Sin lectura reciente"
              : latest?.ts
              ? `Última lectura: ${new Date(latest.ts).toLocaleTimeString()}`
              : ""}
          </text>
        </g>
      )}
    </g>
  );
}
