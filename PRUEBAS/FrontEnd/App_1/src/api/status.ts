// src/api/status.ts
import { getApiRoot, getApiHeaders } from "@/lib/config";
import { withScope } from "@/lib/scope";
import { authHeaders } from "@/lib/http";

function headers(): HeadersInit {
  // Merge headers propios (X-API-Key / Content-Type) + Authorization: Basic
  return { ...getApiHeaders(), ...authHeaders(), Accept: "application/json" };
}

export async function fetchTankStatuses() {
  const res = await fetch(withScope(`${getApiRoot()}/tanks/status`), { headers: headers() });
  if (!res.ok) throw new Error(`status ${res.status}`);
  return res.json();
}

export async function fetchPumpsLatest() {
  const res = await fetch(withScope(`${getApiRoot()}/pumps/latest`), { headers: headers() });
  if (!res.ok) throw new Error(`status ${res.status}`);
  return res.json();
}

export async function fetchKpis() {
  const res = await fetch(withScope(`${getApiRoot()}/dashboard/kpis`), { headers: headers() });
  if (!res.ok) throw new Error(`status ${res.status}`);
  return res.json();
}

export async function fetchLocationsSummary() {
  const res = await fetch(withScope(`${getApiRoot()}/locations/summary`), { headers: headers() });
  if (!res.ok) throw new Error(`status ${res.status}`);
  return res.json();
}
