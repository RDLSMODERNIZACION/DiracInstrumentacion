import React from "react";
// 👇 Import explícito al índice de la carpeta (evita que tome src/widget.tsx viejo)
import Widget from "@/widget/index";

export default function Operations() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("global_service") === "1" && !params.get("service_locations")) {
    return <div className="p-6 text-sm text-slate-500">No hay ubicaciones con equipos para este servicio.</div>;
  }
  return <Widget />;
}
