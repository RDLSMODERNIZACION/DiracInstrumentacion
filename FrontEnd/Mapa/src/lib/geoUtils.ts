import { type LatLng } from "./geo";

export function centroid(poly: LatLng[]): LatLng {
  const lat = poly.reduce((acc, p) => acc + p[0], 0) / poly.length;
  const lng = poly.reduce((acc, p) => acc + p[1], 0) / poly.length;
  return [lat, lng];
}
