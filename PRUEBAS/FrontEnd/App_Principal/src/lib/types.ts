// src/lib/types.ts
export type Location = { id: number; code: string; name: string };
export type LocationSummary = {
  location_id: number;
  location_code: string;
  location_name: string;
  pumps_uptime_avg_30d: number | null;
  pumps_kwh_30d: number;
  tanks_avg_level_pct_30d: number | null;
  worst_severity: 'ok' | 'info' | 'warning' | 'critical';
};
