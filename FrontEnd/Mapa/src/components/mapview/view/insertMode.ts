import type { InsertMode } from "./types";

export function insertMeta(mode: InsertMode) {
  if (mode === "valve") {
    return {
      icon: "🚧",
      label: "Insertar válvula",
      hint: "Tocá el punto exacto sobre una cañería",
      color: "#ef4444",
    };
  }

  if (mode === "tank") {
    return {
      icon: "🛢️",
      label: "Insertar tanque",
      hint: "Tocá la cañería o el punto donde querés ubicar el tanque",
      color: "#06b6d4",
    };
  }

  if (mode === "pump") {
    return {
      icon: "⚙️",
      label: "Insertar bomba",
      hint: "Tocá la cañería o el punto donde querés ubicar la bomba",
      color: "#a855f7",
    };
  }

  return {
    icon: "＋",
    label: "",
    hint: "",
    color: "#94a3b8",
  };
}
