import type { UINode } from "./types";

export const isSet = (v?: number | null) => Number.isFinite(v) && Math.abs((v as number)) > 1;

export const toNumber = (val: any): number | null => {
  if (val === null || val === undefined) return null;
  const n = Number(val);
  return Number.isFinite(n) ? n : null;
};

export const numberOr = (v: number | null | undefined, fb: number): number =>
  isSet(v) ? (v as number) : fb;

export function layoutRow<T extends UINode>(
  nodes: T[],
  { startX = 140, startY = 380, gapX = 160 }: { startX?: number; startY?: number; gapX?: number } = {}
): T[] {
  return nodes.map((n, i) => {
    const xOk = isSet(n.x);
    const yOk = isSet(n.y);
    return {
      ...n,
      x: xOk ? (n.x as number) : startX + i * gapX,
      y: yOk ? (n.y as number) : startY,
    };
  });
}

export function nodesByIdAsArray(map: Record<string, UINode>) {
  return Object.values(map);
}

/** BBox para viewBox auto */
export function computeBBox(nodes: { x: number; y: number }[], pad = 60) {
  if (!nodes.length) return { minx: 0, miny: 0, w: 1000, h: 520 };
  const xs = nodes.map((n) => n.x);
  const ys = nodes.map((n) => n.y);
  const minx = Math.min(...xs) - pad;
  const miny = Math.min(...ys) - pad;
  const maxx = Math.max(...xs) + pad;
  const maxy = Math.max(...ys) + pad;
  return { minx, miny, w: Math.max(1, maxx - minx), h: Math.max(1, maxy - miny) };
}
