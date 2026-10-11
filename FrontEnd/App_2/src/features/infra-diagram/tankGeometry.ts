import type { TankCategory } from "./types";
import { isCompactTank } from "./equipmentAppearance";
type TankPosition = { id?: string; x: number; y: number; categoria?: TankCategory | null };
type Point = { x: number; y: number };
export function treatmentPoolGeometry(category?: TankCategory | null) {
  if (!["pileta_aireacion", "pileta_sedimentacion", "pileta_cloracion"].includes(category ?? "")) return null;
  const poolW = category === "pileta_aireacion" ? 220 : 360;
  const poolH = category === "pileta_aireacion" ? 220 : 150;
  return { poolW, poolH, W: poolW + 40, H: poolH + 100, px: 20, py: 52 };
}
// Shared anchors for the connection picker and the actual pipe endpoints.
export function tankPortPosition(n: TankPosition, portId: string): Point {
  const pool = treatmentPoolGeometry(n.categoria);
  const isWell = n.categoria === "pozo";
  const compact = isCompactTank(n) && (!n.categoria || n.categoria === "tanque");
  const insideX = compact ? 44 : pool ? pool.poolW / 2 - 28 : isWell ? 140 : 118;
  const insideY = compact ? 34 : pool ? pool.poolH / 2 - 28 : isWell ? 105 : 82;
  const cy = n.y + (pool ? 2 : 0);
  const horizontal = compact ? 22 : pool ? pool.poolW / 4 : isWell ? 75 : 65;
  const vertical = compact ? 14 : pool ? pool.poolH / 4 : isWell ? 52 : 42;
  const index = Number(portId.slice(1)) || 1;
  const sideOffset = isWell ? (index === 1 ? -52 : index === 2 ? 52 : 0) : (index - 2) * vertical;
  switch (portId[0]) {
    case "L": return { x: n.x - insideX, y: cy + sideOffset };
    case "R": return { x: n.x + insideX, y: cy + sideOffset };
    case "T": return { x: n.x + (index - 2) * horizontal, y: cy - insideY };
    case "B": return { x: n.x + (index - 2) * horizontal, y: cy + insideY };
    default: return { x: n.x, y: cy };
  }
}
// Perpendicular run crosses the wall and ends inside the water area.
export function poolPortOutside(n: TankPosition, portId: string): Point | null {
  const pool = treatmentPoolGeometry(n.categoria);
  if (!pool) return null;
  const p = tankPortPosition(n, portId);
  switch (portId[0]) {
    case "L": return { x: n.x - pool.poolW / 2 - 14, y: p.y };
    case "R": return { x: n.x + pool.poolW / 2 + 14, y: p.y };
    case "T": return { x: p.x, y: n.y + 2 - pool.poolH / 2 - 14 };
    case "B": return { x: p.x, y: n.y + 2 + pool.poolH / 2 + 14 };
    default: return null;
  }
}
