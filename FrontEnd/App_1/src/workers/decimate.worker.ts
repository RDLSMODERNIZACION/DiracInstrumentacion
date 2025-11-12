// LTTB en WebWorker: reduce a ~N puntos manteniendo forma y picos.
// Soporta nulls (los saltea) y preserva primer/último punto.

export type DecimateReq = {
  x: number[];               // timestamps ms
  y: Array<number|null>;     // valores (nulls permitidos)
  maxPts: number;            // objetivo (≈ ancho en px)
  keepEnds?: boolean;        // default true
};
export type DecimateResp = { x: number[]; y: Array<number|null> };

function lttb(x:number[], y:(number|null)[], threshold:number, keepEnds=true): DecimateResp {
  const n = Math.min(x.length, y.length);
  if (threshold <= 0 || n <= threshold) return { x: x.slice(), y: y.slice() };

  // Compactar nulls (LTTB necesita valores)
  const xv:number[] = [], yv:number[] = [], idx:number[] = [];
  for (let i=0;i<n;i++){ const yy=y[i]; if (yy!=null && Number.isFinite(yy)){ xv.push(x[i]); yv.push(yy as number); idx.push(i);} }
  const m = xv.length;
  if (m <= threshold) {
    // reconstruyo con nulls en los lugares originales para no romper longitudes
    const xx:number[] = [], yy2:(number|null)[] = [];
    for (let i=0;i<n;i++) { xx.push(x[i]); yy2.push(y[i]); }
    return { x: xx, y: yy2 };
  }

  const outX:number[] = []; const outY:number[] = [];
  const bucketSize = (m - 2) / (threshold - 2);
  let a = 0; // índice del punto "pivote" anterior (en xv/yv)
  if (keepEnds) { outX.push(xv[0]); outY.push(yv[0]); }

  for (let i=0; i < threshold-2; i++) {
    const rangeStart = Math.floor((i+1) * bucketSize) + 1;
    const rangeEnd = Math.floor((i+2) * bucketSize) + 1;
    const rangeEndClamped = Math.min(rangeEnd, m);

    // Centroide del siguiente bucket
    let avgX = 0, avgY = 0, avgRange = rangeStart;
    const avgRangeEnd = rangeEndClamped;
    for (; avgRange < avgRangeEnd; avgRange++){ avgX += xv[avgRange]; avgY += yv[avgRange]; }
    const avgRangeLen = Math.max(1, (avgRangeEnd - rangeStart));
    avgX /= avgRangeLen; avgY /= avgRangeLen;

    // En el bucket actual, elegimos el punto con área de triángulo máxima
    let maxArea = -1; let maxAreaIdx = -1;
    const rangeOffStart = Math.floor(i * bucketSize) + 1;
    const rangeOffEnd = Math.floor((i+1) * bucketSize) + 1;
    for (let j = rangeOffStart; j < Math.min(rangeOffEnd, m); j++) {
      // área del triángulo (a -> j -> centroide)
      const area = Math.abs(
        (xv[a] - avgX) * (yv[j] - yv[a]) -
        (xv[a] - xv[j]) * (avgY - yv[a])
      );
      if (area > maxArea) { maxArea = area; maxAreaIdx = j; }
    }
    outX.push(xv[maxAreaIdx]); outY.push(yv[maxAreaIdx]);
    a = maxAreaIdx; // pivote
  }

  if (keepEnds) {
    outX.push(xv[m-1]); outY.push(yv[m-1]);
  }

  // No reinsertamos nulls (ya decimado). El chart recibe solo puntos válidos.
  return { x: outX, y: outY };
}

self.onmessage = (e: MessageEvent<DecimateReq>) => {
  const { x, y, maxPts, keepEnds=true } = e.data;
  const res = lttb(x, y, Math.max(8, maxPts|0), keepEnds);
  (self as any).postMessage(res);
};
export {};
