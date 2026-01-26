import React, { useMemo } from "react";
import useNodeDragCommon from "../../useNodeDragCommon";
import type { UINode } from "../../types";

/**
 * NetworkAnalyzerNodeView (ABB / Analizador de Red)
 * - Solo visual (pantallazo): kW, cosφ, kWh hoy
 * - Si no hay datos => "--"
 *
 * Espera que el node tenga señales en alguna de estas formas:
 * 1) node.signals = { power_kw, pf, kwh_today }  (o equivalentes)
 * 2) node.data?.signals = { ... }
 * 3) node.values = { ... }
 *
 * Después lo atamos al backend como quieras.
 */

function toNum(v: any): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "string" ? Number(v.replace(",", ".")) : Number(v);
  return Number.isFinite(n) ? n : null;
}

function fmt(v: any, decimals = 1): string {
  const n = toNum(v);
  if (n === null) return "--";
  return n.toFixed(decimals);
}

function pickSignal(signals: any, keys: string[]) {
  if (!signals) return null;
  for (const k of keys) {
    if (signals[k] !== undefined && signals[k] !== null) return signals[k];
  }
  return null;
}

export default function NetworkAnalyzerNodeView({
  n,
  editable,
  selected,
  onSelect,
}: {
  n: UINode & {
    // opcional, no rompe tipos existentes
    signals?: Record<string, any>;
    data?: any;
    values?: any;
  };
  editable: boolean;
  selected?: boolean;
  onSelect?: () => void;
}) {
  const drag = useNodeDragCommon({ id: String((n as any).id ?? n.node_id ?? n.name ?? "na") });

  const signals = (n as any).signals ?? (n as any).data?.signals ?? (n as any).values ?? (n as any).data ?? null;

  const powerKW = useMemo(
    () =>
      pickSignal(signals, [
        "power_kw",
        "kw",
        "p_kw",
        "p",
        "active_power_kw",
        "active_power",
      ]),
    [signals]
  );

  const pf = useMemo(
    () => pickSignal(signals, ["pf", "cosphi", "cos_phi", "cosφ", "power_factor"]),
    [signals]
  );

  const kwhToday = useMemo(
    () => pickSignal(signals, ["kwh_today", "energy_today", "kwh_day", "kwh"]),
    [signals]
  );

  // Estado visual: si tiene al menos un dato, lo consideramos "online"
  const hasAny = toNum(powerKW) !== null || toNum(pf) !== null || toNum(kwhToday) !== null;

  const border = selected ? "border-sky-400" : "border-slate-200";
  const bg = hasAny ? "bg-white" : "bg-slate-50";

  return (
    <div
      className={[
        "rounded-xl border shadow-sm",
        border,
        bg,
        "px-3 py-2",
        "select-none",
        "min-w-[170px]",
      ].join(" ")}
      onMouseDown={(e) => {
        if (!editable) return;
        onSelect?.();
        drag.onMouseDown?.(e as any);
      }}
      onClick={() => onSelect?.()}
      title="Analizador de red (ABB)"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="text-[12px] font-semibold text-slate-700">
          Analizador de red
        </div>

        <div className="flex items-center gap-1">
          <span
            className={[
              "inline-block h-2.5 w-2.5 rounded-full",
              hasAny ? "bg-emerald-500" : "bg-slate-300",
            ].join(" ")}
          />
          <span className="text-[11px] text-slate-500">
            {hasAny ? "online" : "—"}
          </span>
        </div>
      </div>

      {/* Body */}
      <div className="mt-2 grid grid-cols-1 gap-1">
        <div className="flex items-baseline justify-between">
          <span className="text-[12px] text-slate-600">⚡ kW</span>
          <span className="text-[13px] font-semibold text-slate-800">
            {fmt(powerKW, 1)}
          </span>
        </div>

        <div className="flex items-baseline justify-between">
          <span className="text-[12px] text-slate-600">cos φ</span>
          <span className="text-[13px] font-semibold text-slate-800">
            {fmt(pf, 2)}
          </span>
        </div>

        <div className="flex items-baseline justify-between">
          <span className="text-[12px] text-slate-600">hoy kWh</span>
          <span className="text-[13px] font-semibold text-slate-800">
            {fmt(kwhToday, 0)}
          </span>
        </div>
      </div>
    </div>
  );
}
