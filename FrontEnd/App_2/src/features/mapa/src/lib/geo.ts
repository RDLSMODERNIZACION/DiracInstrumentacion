export type LatLng = [number, number]; // [lat,lng]

export function closeRing(points: LatLng[]): LatLng[] {
  if (points.length < 3) return points;
  const first = points[0];
  const last = points[points.length - 1];
  if (first[0] === last[0] && first[1] === last[1]) return points;
  return [...points, first];
}

export function polygonBounds(points: LatLng[]) {
  let minLat = Infinity, minLng = Infinity, maxLat = -Infinity, maxLng = -Infinity;
  for (const [lat, lng] of points) {
    minLat = Math.min(minLat, lat);
    minLng = Math.min(minLng, lng);
    maxLat = Math.max(maxLat, lat);
    maxLng = Math.max(maxLng, lng);
  }
  return { minLat, minLng, maxLat, maxLng };
}

// Ray casting point-in-polygon for simple polygons
export function pointInPolygon(point: LatLng, polygon: LatLng[]) {
  const [lat, lng] = point;
  const ring = closeRing(polygon);

  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [latI, lngI] = ring[i];
    const [latJ, lngJ] = ring[j];

    const xi = lngI, yi = latI;
    const xj = lngJ, yj = latJ;
    const x = lng, y = lat;

    const intersect =
      (yi > y) !== (yj > y) &&
      x < ((xj - xi) * (y - yi)) / (yj - yi + 0.0) + xi;

    if (intersect) inside = !inside;
  }
  return inside;
}
