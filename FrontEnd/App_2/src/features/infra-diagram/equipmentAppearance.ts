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
