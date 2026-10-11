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
  "tank:25": "pump:33",
  "tank:27": "pump:37",
  "tank:36": "pump:43", "tank:37": "pump:44", "tank:38": "pump:45",
};
export const MOUNTED_PUMP_Y = -90;
export function mountedPumpOffset(tankId?: string) {
  return ["tank:25", "tank:27"].includes(tankId ?? "") ? { x: 0, y: -160 } : { x: 0, y: MOUNTED_PUMP_Y };
}
export function isTankPumpBlock(n: { id?: string }) { return !!TANK_PUMP_PAIRS[n.id ?? ""]; }
export function mountedPumpPosition(tank: { id?: string; x: number; y: number }) {
  const offset = mountedPumpOffset(tank.id);
  return { x: tank.x + offset.x, y: tank.y + offset.y };
}
export function resolveMountedPumps<T extends { id: string; type: string; x: number; y: number }>(nodes: Record<string, T>) {
  const result = { ...nodes };
  for (const [tankId, pumpId] of Object.entries(TANK_PUMP_PAIRS)) {
    const tank = nodes[tankId], pump = nodes[pumpId];
    if (tank?.type === "tank" && pump?.type === "pump") {
      result[pumpId] = { ...pump, ...mountedPumpPosition(tank) };
    }
  }
  for (const [intakeId, pumpIds] of Object.entries(INTAKE_PUMPS)) {
    const intake = nodes[intakeId];
    if (intake?.type !== "manifold") continue;
    pumpIds.forEach((pumpId, index) => {
      if (nodes[pumpId]?.type === "pump") result[pumpId] = { ...nodes[pumpId], ...intakePumpPosition(intake, index) };
    });
  }
  return result;
}

export function tankBlockConnectionPoint(n: { id?: string; x: number; y: number }, side: "in" | "out" = "out") {
  const inside = ["tank:25", "tank:27"].includes(n.id ?? "") ? 140 : 44;
  return { x: n.x + (side === "in" ? -inside : inside), y: n.y };
}
export function mountedPumpConnectionPoint(n: { id: string; x: number; y: number }) {
  const pair = Object.entries(TANK_PUMP_PAIRS).find(([, pumpId]) => pumpId === n.id);
  if (!pair) {
    const intakePair = Object.entries(INTAKE_PUMPS).find(([, ids]) => ids.includes(n.id));
    if (!intakePair) return null;
    const index = intakePair[1].indexOf(n.id);
    return { x: n.x + 65 - index * 70 + 170, y: n.y + 30 };
  }
  const offset = mountedPumpOffset(pair[0]);
  return tankBlockConnectionPoint({ id: pair[0], x: n.x - offset.x, y: n.y - offset.y });
}

export const INTAKE_PUMPS: Record<string, string[]> = { "manifold:27": ["pump:41", "pump:42"] };
export function containedPumpIds(parentId: string) {
  return INTAKE_PUMPS[parentId] ?? (TANK_PUMP_PAIRS[parentId] ? [TANK_PUMP_PAIRS[parentId]] : []);
}
export function intakePumpPosition(intake: { x: number; y: number }, index: number) {
  return { x: intake.x - 65 + index * 70, y: intake.y - 30 };
}
