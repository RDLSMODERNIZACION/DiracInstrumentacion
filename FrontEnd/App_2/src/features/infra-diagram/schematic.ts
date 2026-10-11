import type { UINode } from "./types";
export const SAND_FILTER_RADIUS = 70;
export const SAND_FILTER_PORT_X = 86;
export function isSandFilter(n: UINode) {
  return n.type === "manifold" && n.meta?.symbol === "sand_filter";
}
export function sandFilterPort(n: { x: number; y: number }, side: "in" | "out") {
  return { x: n.x + (side === "in" ? -SAND_FILTER_PORT_X : SAND_FILTER_PORT_X), y: n.y };
}
