// src/api/reliability.ts
import { scopedUrl, getApiHeaders } from "@/lib/config";
import { authHeaders } from "@/lib/http";

export type ReliabilityBucket = {
  bucket_start: string;
  bucket_end: string;
  has_data: boolean;
  sample_count: number;
};

export type ReliabilityTimelineResponse = {
  company_id: number | null;
  location_id: number | null;
  days: number;
  bucket_minutes: number;
  tz: string;
  total_buckets: number;
  connected_buckets: number;
  uptime_ratio: number | null;
  timeline: ReliabilityBucket[];
};

function headers(): HeadersInit {
  return {
    ...getApiHeaders(),
    ...authHeaders(),
    Accept: "application/json",
  };
}

/**
 * Trae la timeline de conectividad para una ubicación o para toda la empresa.
 * Usa /kpi/reliability/location_timeline en el backend.
 */
export async function fetchLocationTimeline(args: {
  locationId?: number;
  days?: number;
  bucketMinutes?: number;
  tz?: string;
  companyId?: number;
}): Promise<ReliabilityTimelineResponse | null> {
  const {
    locationId,
    days = 7,
    bucketMinutes = 60,
    tz = "America/Argentina/Buenos_Aires",
    companyId,
  } = args;

  // scopedUrl se encarga de meter company_id según el scope actual.
  const url = new URL(scopedUrl("/reliability/location_timeline", companyId));

  url.searchParams.set("days", String(days));
  url.searchParams.set("bucket_minutes", String(bucketMinutes));
  url.searchParams.set("tz", tz);
  if (locationId != null) {
    url.searchParams.set("location_id", String(locationId));
  }

  try {
    const res = await fetch(url.toString(), { headers: headers() });
    if (!res.ok) {
      console.error(
        "[reliability] HTTP error",
        res.status,
        res.statusText,
        "url:",
        url.toString()
      );
      return null;
    }
    const json = (await res.json()) as ReliabilityTimelineResponse;
    return json;
  } catch (e) {
    console.error("[reliability] fetchLocationTimeline error:", e);
    return null;
  }
}
