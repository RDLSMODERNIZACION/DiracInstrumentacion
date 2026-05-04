import type { SimRunResponse } from "./types";
import { featureId, getProp, pickLabel } from "./pipeFeatureUtils";

export function normalizeText(s: string) {
  return String(s ?? "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function inferPipeRole(feature: any) {
  const label = String(pickLabel(feature) ?? "");
  const flowFunc = String(getProp(feature, "flow_func", "flowFunc", "funcion", "función") ?? "");

  const layerTxt = normalizeText(label);
  const flowTxt = normalizeText(flowFunc);

  const explicitImpulsion =
    /IMPULS|IMPULSION/.test(flowTxt) || /IMPULS|IMPULSION/.test(layerTxt);

  if (explicitImpulsion) {
    return {
      key: "impulsion" as const,
      label: "Impulsión",
      color: "#2563eb",
      dashArray: undefined as string | undefined,
    };
  }

  const isRamal =
    /RAMAL|SECUNDARIA|SECUNDARIO|SERVICIO|DOMICILIARIA|PVC 063|PVC 075|PVC 090/.test(layerTxt);

  if (isRamal) {
    return {
      key: "ramal" as const,
      label: "Ramal / secundaria",
      color: "#14b8a6",
      dashArray: "4 7",
    };
  }

  const explicitDistribution =
    /DISTRIB|DISTRIBUCION|RED|MALLA|ACUEDUCTO|TRONCAL|COLECTOR|SALIDA/.test(flowTxt) ||
    /DISTRIB|DISTRIBUCION|RED|MALLA|ACUEDUCTO|TRONCAL|COLECTOR|SALIDA/.test(layerTxt);

  if (explicitDistribution) {
    return {
      key: "distribucion" as const,
      label: "Distribución",
      color: "#16a34a",
      dashArray: "10 6",
    };
  }

  return {
    key: "distribucion" as const,
    label: "Distribución",
    color: "#16a34a",
    dashArray: "10 6",
  };
}

export function getDiameterMm(feature: any, sim?: SimRunResponse | null) {
  const id = featureId(feature);
  const ps = id && sim?.pipes ? sim.pipes[id] : null;

  const raw =
    getProp(feature, "diametro_mm", "diameter_mm", "diam_mm", "diametro") ??
    ps?.diam_mm ??
    null;

  if (raw == null) return null;

  const n = Number(raw);
  if (!isFinite(n)) return null;

  return n;
}

export function diameterWeight(d: number | null) {
  if (d == null) return 3;
  if (d <= 63) return 2.5;
  if (d <= 75) return 3.0;
  if (d <= 90) return 3.6;
  if (d <= 110) return 4.3;
  if (d <= 140) return 5.0;
  if (d <= 160) return 5.8;
  if (d <= 200) return 6.8;
  if (d <= 250) return 8.0;

  return 9.2;
}