// Visual overrides for the new equipment in Planta Oeste. Existing equipment keeps its size.
const COMPACT_TANKS = new Set(["tank:36", "tank:37", "tank:38"]);
const SMALL_PUMPS = new Set(["pump:43", "pump:44", "pump:45"]);
export function isCompactTank(n: { id?: string }) { return COMPACT_TANKS.has(n.id ?? ""); }
export function pumpVisualScale(n: { id?: string }) { return SMALL_PUMPS.has(n.id ?? "") ? 0.65 : 1; }
export function smallPumpPort(n: { id: string; x: number; y: number }, portId: string) {
  const scale = pumpVisualScale(n);
  const offsets: Record<string, { x: number; y: number }> = {
    L: { x: -18, y: 20 }, R: { x: 18, y: 20 },
    T: { x: 0, y: -36 }, B: { x: 0, y: 49 },
  };
  const p = offsets[portId[0]] ?? offsets.R;
  return { x: n.x + p.x * scale, y: n.y + p.y * scale };
}

export const TANK_PUMP_PAIRS: Record<string, string> = {
  "tank:36": "pump:43", "tank:37": "pump:44", "tank:38": "pump:45",
};
export const MOUNTED_PUMP_Y = -90;
export function mountedPumpPosition(tank: { x: number; y: number }) {
  return { x: tank.x, y: tank.y + MOUNTED_PUMP_Y };
}
export function resolveMountedPumps<T extends { id: string; type: string; x: number; y: number }>(nodes: Record<string, T>) {
  const result = { ...nodes };
  for (const [tankId, pumpId] of Object.entries(TANK_PUMP_PAIRS)) {
    const tank = nodes[tankId], pump = nodes[pumpId];
    if (tank?.type === "tank" && pump?.type === "pump") {
      result[pumpId] = { ...pump, ...mountedPumpPosition(tank) };
    }
  }
  return result;
}
