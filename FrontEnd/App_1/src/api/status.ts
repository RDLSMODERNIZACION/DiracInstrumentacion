// kpiz/src/api/status.ts
import { getApiRoot, getApiHeaders } from "@/lib/config";

export async function fetchTankStatuses() {
  const res = await fetch(`${getApiRoot()}/tanks/status`, { headers: getApiHeaders() });
  if (!res.ok) throw new Error(`status ${res.status}`);
  return res.json();
}

// kpiz/src/api/pumps.ts
import { getApiRoot, getApiHeaders } from "@/lib/config";

export async function fetchPumpsLatest() {
  const res = await fetch(`${getApiRoot()}/pumps/latest`, { headers: getApiHeaders() });
  if (!res.ok) throw new Error(`status ${res.status}`);
  return res.json();
}

export async function fetchPumpsTimeseries24h() {
  const res = await fetch(`${getApiRoot()}/pumps/timeseries?window=24h`, { headers: getApiHeaders() });
  if (!res.ok) throw new Error(`status ${res.status}`);
  return res.json();
}

// kpiz/src/api/kpis.ts
import { getApiRoot, getApiHeaders } from "@/lib/config";
export async function fetchKpis() {
  const res = await fetch(`${getApiRoot()}/dashboard/kpis`, { headers: getApiHeaders() });
  if (!res.ok) throw new Error(`status ${res.status}`);
  return res.json();
}

// kpiz/src/api/locations.ts
import { getApiRoot, getApiHeaders } from "@/lib/config";
export async function fetchLocationsSummary() {
  const res = await fetch(`${getApiRoot()}/locations/summary`, { headers: getApiHeaders() });
  if (!res.ok) throw new Error(`status ${res.status}`);
  return res.json();
}
