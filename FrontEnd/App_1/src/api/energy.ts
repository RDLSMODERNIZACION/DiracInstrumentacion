// src/api/energy.ts
// API de Eficiencia Energética: distribución mensual de HORAS ON por bandas.

import { scopedUrl, getApiHeaders } from "@/lib/config";
import { authHeaders } from "@/lib/http";

export type EnergyBucketH = { key: string; label: string; hours: number };
export type EnergyRuntime = {
  month: string;
  total_hours: number;
  buckets: EnergyBucketH[];
};

export type EnergyRuntimeArgs = {
  month: string; // "YYYY-MM"
  locationId?: number;
  tz?: string;
  bandSetId?: number;
  companyId?: number; // si querés forzar empresa distinta a la del scope
};

function headers(): HeadersInit {
  // Igual que en src/api/status.ts
  return { ...getApiHeaders(), ...authHeaders(), Accept: "application/json" };
}

export async function fetchEnergyRuntime(
  params: EnergyRuntimeArgs
): Promise<EnergyRuntime | null> {
  const {
    month,
    locationId,
    tz = "America/Argentina/Buenos_Aires",
    bandSetId,
    companyId,
  } = params;

  if (!month || month.length !== 7 || month[4] !== "-") {
    console.warn("[energy] month inválido, esperado 'YYYY-MM':", month);
    return null;
  }

  // Partimos de la URL ya "scoped" (agrega ?company_id=XX si corresponde)
  const url = new URL(scopedUrl("/energy/runtime", companyId));

  url.searchParams.set("month", month);
  if (locationId != null) url.searchParams.set("location_id", String(locationId));
  if (tz) url.searchParams.set("tz", tz);
  if (bandSetId != null) url.searchParams.set("band_set_id", String(bandSetId));

  try {
    const res = await fetch(url.toString(), { headers: headers() });
    if (!res.ok) {
      console.error(
        "[energy] HTTP error",
        res.status,
        res.statusText,
        "url:",
        url.toString()
      );
      return null;
    }

    const raw = (await res.json()) as any;

    // Normalizar tipos
    const buckets: EnergyBucketH[] = Array.isArray(raw?.buckets)
      ? raw.buckets.map((b: any) => ({
          key: String(b.key ?? ""),
          label: String(b.label ?? b.key ?? ""),
          hours: typeof b.hours === "string" ? parseFloat(b.hours) : Number(b.hours ?? 0),
        }))
      : [];

    const total =
      typeof raw?.total_hours === "string"
        ? parseFloat(raw.total_hours)
        : Number(raw?.total_hours ?? buckets.reduce((a, b) => a + b.hours, 0));

    return {
      month,
      total_hours: total,
      buckets,
    };
  } catch (e) {
    console.error("[energy] runtime fetch exception:", e);
    return null;
  }
}
