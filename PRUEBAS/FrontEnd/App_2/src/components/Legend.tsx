import React from "react";

export default function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs">
      {/* Bombas encendidas */}
      <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 bg-emerald-100 text-emerald-700">
        <span className="h-2 w-2 rounded-full bg-emerald-500 inline-block" /> Bomba activa (run)
      </span>

      {/* Bombas en standby */}
      <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 bg-amber-100 text-amber-800">
        <span className="h-2 w-2 rounded-full bg-amber-500 inline-block" /> Standby / Regulación (stop)
      </span>

      {/* Alarmas o fallas */}
      <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 bg-rose-100 text-rose-700">
        <span className="h-2 w-2 rounded-full bg-rose-600 inline-block" /> Alarma crítica
      </span>

      {/* Flujo de conexión */}
      <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 bg-sky-100 text-sky-700">
        <span className="h-2 w-2 rounded-full bg-sky-600 inline-block" /> Flujo (pipe activo)
      </span>

      {/* Texto auxiliar */}
      <span className="text-[10px] text-slate-500">
        Grosor de línea = diámetro de caño
      </span>
    </div>
  );
}
