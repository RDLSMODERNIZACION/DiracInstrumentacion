// src/features/infra-diagram/services/pumps.ts
import { withScope } from "@/lib/scope";
import { API_BASE } from "@/lib/api";
import { authHeaders } from "@/lib/http";

export async function issuePumpCommand(
  pumpId: number,
  action: "start" | "stop",
  pin?: string
) {
  const url = withScope(`${API_BASE}/dirac/pumps/${pumpId}/command`);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...authHeaders(),           // ← Authorization: Basic ...
    },
    // ⚠️ IMPORTANTE: sin cookies en este POST
    // credentials: "omit"  // (por defecto omit)
    body: JSON.stringify({ action, pin }),
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} ${res.statusText} - ${msg || "No se pudo emitir el comando"}`);
  }
  return res.json();
}
