import React from "react";
// 👇 Import explícito al índice de la carpeta (evita que tome src/widget.tsx viejo)
import Widget from "@/widget/index";

export default function Operations() {
  return <Widget />;
}
