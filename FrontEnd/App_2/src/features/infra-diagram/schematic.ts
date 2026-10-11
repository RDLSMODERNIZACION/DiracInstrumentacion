import type { UINode } from "./types";
export const SAND_FILTER_RADIUS = 70;
export const SAND_FILTER_PORT_X = 86;
export function isSandFilter(n: UINode) {
  return n.type === "manifold" && n.meta?.symbol === "sand_filter";
}
export function sandFilterPort(n: { x: number; y: number }, side: "in" | "out") {
  return { x: n.x + (side === "in" ? -SAND_FILTER_PORT_X : SAND_FILTER_PORT_X), y: n.y };
}

export function isSchematicEquipment(n: UINode) {
  return n.type === "manifold" && ["sand_filter", "mixer", "sedimenter", "dosing_tank", "dosing_pump", "lagoon"].includes(n.meta?.symbol ?? "");
}
export function schematicPort(n: UINode, side: "in" | "out") {
  const symbol = n.type === "manifold" ? n.meta?.symbol : null;
  const offset = symbol === "lagoon" ? 176 : symbol === "sedimenter" ? 156 : symbol === "mixer" ? 90 : symbol === "dosing_tank" ? 74 : symbol === "dosing_pump" ? 65 : SAND_FILTER_PORT_X;
  return { x: n.x + (side === "in" ? -offset : offset), y: n.y };
}
