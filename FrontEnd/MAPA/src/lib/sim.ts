export function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

export function round(n: number, decimals = 0) {
  const p = 10 ** decimals;
  return Math.round(n * p) / p;
}

export function seededNoise(seed: number) {
  // deterministic pseudo random
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}
