// src/components/mapview/view/geometry.ts

export type LngLat = [number, number];
export type LatLngPoint = { lat: number; lng: number };

type LineGeometry =
  | { type: "LineString"; coordinates: any[] }
  | { type: "MultiLineString"; coordinates: any[] };

function isCoord(c: any): c is LngLat {
  return (
    Array.isArray(c) &&
    c.length >= 2 &&
    Number.isFinite(Number(c[0])) &&
    Number.isFinite(Number(c[1]))
  );
}

function toPoint(c: any): LatLngPoint | null {
  if (!isCoord(c)) return null;
  return { lng: Number(c[0]), lat: Number(c[1]) };
}

function pointKey(p: LatLngPoint, digits = 7) {
  return `${p.lat.toFixed(digits)},${p.lng.toFixed(digits)}`;
}

export function getLineSegmentsFromGeometry(geom: any): LngLat[][] {
  if (!geom || !Array.isArray(geom.coordinates)) return [];

  if (geom.type === "LineString") {
    const coords = geom.coordinates.filter(isCoord) as LngLat[];
    return coords.length >= 2 ? [coords] : [];
  }

  if (geom.type === "MultiLineString") {
    return geom.coordinates
      .map((segment: any[]) => (Array.isArray(segment) ? segment.filter(isCoord) : []))
      .filter((segment: LngLat[]) => segment.length >= 2);
  }

  return [];
}

export function getGeometryEndpoints(geom: LineGeometry): LatLngPoint[] {
  const points: LatLngPoint[] = [];
  const seen = new Set<string>();

  function add(c: any) {
    const p = toPoint(c);
    if (!p) return;

    const key = pointKey(p);
    if (seen.has(key)) return;

    seen.add(key);
    points.push(p);
  }

  for (const segment of getLineSegmentsFromGeometry(geom)) {
    add(segment[0]);
    add(segment[segment.length - 1]);
  }

  return points;
}

export function getGeometryVertices(geom: LineGeometry, includeEndpoints = false): LatLngPoint[] {
  const points: LatLngPoint[] = [];
  const seen = new Set<string>();

  for (const segment of getLineSegmentsFromGeometry(geom)) {
    for (let i = 0; i < segment.length; i += 1) {
      if (!includeEndpoints && (i === 0 || i === segment.length - 1)) continue;

      const p = toPoint(segment[i]);
      if (!p) continue;

      const key = pointKey(p);
      if (seen.has(key)) continue;

      seen.add(key);
      points.push(p);
    }
  }

  return points;
}

export function distanceMeters(a: LatLngPoint, b: LatLngPoint) {
  const earthRadiusM = 6371000;
  const phi1 = (a.lat * Math.PI) / 180;
  const phi2 = (b.lat * Math.PI) / 180;
  const dPhi = ((b.lat - a.lat) * Math.PI) / 180;
  const dLambda = ((b.lng - a.lng) * Math.PI) / 180;

  const sinDphi = Math.sin(dPhi / 2);
  const sinDlambda = Math.sin(dLambda / 2);

  const h =
    sinDphi * sinDphi + Math.cos(phi1) * Math.cos(phi2) * sinDlambda * sinDlambda;

  return 2 * earthRadiusM * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function interpolate(a: LatLngPoint, b: LatLngPoint, t: number): LatLngPoint {
  return {
    lat: a.lat + (b.lat - a.lat) * t,
    lng: a.lng + (b.lng - a.lng) * t,
  };
}

export function getInternalProbePoints(
  geom: LineGeometry,
  options: {
    spacingM?: number;
    maxPoints?: number;
    minDistanceFromEndpointM?: number;
  } = {}
): LatLngPoint[] {
  const spacingM = options.spacingM ?? 8;
  const maxPoints = options.maxPoints ?? 80;
  const minDistanceFromEndpointM = options.minDistanceFromEndpointM ?? 1.2;

  const points: LatLngPoint[] = [];
  const seen = new Set<string>();

  for (const segment of getLineSegmentsFromGeometry(geom)) {
    for (let i = 0; i < segment.length - 1; i += 1) {
      const a = toPoint(segment[i]);
      const b = toPoint(segment[i + 1]);
      if (!a || !b) continue;

      const len = distanceMeters(a, b);
      if (len <= spacingM * 1.5) continue;

      const steps = Math.max(1, Math.floor(len / spacingM));

      for (let j = 1; j < steps; j += 1) {
        const p = interpolate(a, b, j / steps);

        if (
          distanceMeters(a, p) < minDistanceFromEndpointM ||
          distanceMeters(b, p) < minDistanceFromEndpointM
        ) {
          continue;
        }

        const key = pointKey(p, 6);
        if (seen.has(key)) continue;

        seen.add(key);
        points.push(p);

        if (points.length >= maxPoints) return points;
      }
    }
  }

  return points;
}
