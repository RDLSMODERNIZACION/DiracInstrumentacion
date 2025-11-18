// src/components/scada/LiveDot.tsx
import React from "react";

export function LiveDot({ up }: { up: boolean }) {
  const cls = up
    ? "bg-emerald-500 shadow-[0_0_0_2px_rgba(16,185,129,0.3)]"
    : "bg-slate-300";
  return (
    <span className={`inline-block h-2.5 w-2.5 rounded-full ${cls}`} title={up ? "Tiempo real conectado" : "Tiempo real desconectado"} />
  );
}
