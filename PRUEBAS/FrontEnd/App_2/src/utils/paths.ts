// src/utils/paths.ts
export function orthogonalPath(
  aId: string,
  bId: string,
  nodesById: Record<string, { x: number; y: number }>
): string {
  const A = nodesById[aId];
  const B = nodesById[bId];
  if (!A || !B) return "";

  const midX = (A.x + B.x) / 2;
  return `M ${A.x},${A.y} L ${midX},${A.y} L ${midX},${B.y} L ${B.x},${B.y}`;
}
