// src/components/mapview/view/pipeAutoConnect.ts

import { connectPipesAtIntersection } from "../../../services/mapasagua";
import {
  getGeometryEndpoints,
  getGeometryVertices,
  getInternalProbePoints,
  type LatLngPoint,
} from "./geometry";
import { AUTO_CONNECT_OPTIONS } from "./constants";

type AutoConnectPoint = LatLngPoint & {
  reason: "endpoint" | "vertex" | "internal_probe";
  tolerance_m: number;
};

export type AutoConnectPipeGeometryResult = {
  points_attempted: number;
  points_ok: number;
  points_failed: number;
  details: Array<{
    point: AutoConnectPoint;
    ok: boolean;
    response?: any;
    error?: any;
  }>;
};

function keyForPoint(p: LatLngPoint, digits = 6) {
  return `${p.lat.toFixed(digits)},${p.lng.toFixed(digits)}`;
}

function uniquePoints(points: AutoConnectPoint[]) {
  const seen = new Set<string>();
  const out: AutoConnectPoint[] = [];

  for (const p of points) {
    const key = `${p.reason}:${keyForPoint(p)}`;
    if (seen.has(key)) continue;

    seen.add(key);
    out.push(p);
  }

  return out;
}

export async function autoConnectPipeGeometry(
  geom: any,
  options: {
    includeVertices?: boolean;
    includeInternalProbes?: boolean;
    endpointToleranceM?: number;
    internalToleranceM?: number;
    internalSpacingM?: number;
    maxInternalProbePoints?: number;
  } = {}
): Promise<AutoConnectPipeGeometryResult> {
  const endpointToleranceM =
    options.endpointToleranceM ?? AUTO_CONNECT_OPTIONS.endpointToleranceM;
  const internalToleranceM =
    options.internalToleranceM ?? AUTO_CONNECT_OPTIONS.internalToleranceM;

  const endpoints: AutoConnectPoint[] = getGeometryEndpoints(geom).map((p) => ({
    ...p,
    reason: "endpoint",
    tolerance_m: endpointToleranceM,
  }));

  const vertices: AutoConnectPoint[] = options.includeVertices
    ? getGeometryVertices(geom, false).map((p) => ({
        ...p,
        reason: "vertex",
        tolerance_m: internalToleranceM,
      }))
    : [];

  /**
   * Esto permite detectar cruces en mitad de un tramo aunque no haya un vértice exacto.
   * Usamos baja tolerancia para evitar conexiones falsas con cañerías paralelas cercanas.
   */
  const internalProbes: AutoConnectPoint[] = options.includeInternalProbes
    ? getInternalProbePoints(geom, {
        spacingM: options.internalSpacingM ?? AUTO_CONNECT_OPTIONS.internalSpacingM,
        maxPoints:
          options.maxInternalProbePoints ?? AUTO_CONNECT_OPTIONS.maxInternalProbePoints,
      }).map((p) => ({
        ...p,
        reason: "internal_probe",
        tolerance_m: internalToleranceM,
      }))
    : [];

  const points = uniquePoints([...endpoints, ...vertices, ...internalProbes]);

  const details: AutoConnectPipeGeometryResult["details"] = [];

  for (const point of points) {
    try {
      const response = await connectPipesAtIntersection({
        lat: point.lat,
        lng: point.lng,
        tolerance_m: point.tolerance_m,
        apply: true,
      } as any);

      details.push({ point, ok: Boolean(response?.ok), response });
    } catch (error) {
      console.warn("No se pudo autoconectar punto de geometría", { point, error });
      details.push({ point, ok: false, error });
    }
  }

  return {
    points_attempted: details.length,
    points_ok: details.filter((d) => d.ok).length,
    points_failed: details.filter((d) => !d.ok).length,
    details,
  };
}
