// src/features/infra-diagram/services/pumps.ts
import { withScope } from "@/lib/scope";
import { API_BASE } from "@/lib/api";

export async function issuePumpCommand(
  pumpId: number,
  action: "start" | "stop",
  pin?: string
) {
  const res = await fetch(withScope(`${API_BASE}/dirac/pumps/${pumpId}/command`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include", // mantenelo si tu auth es por cookie
    body: JSON.stringify({ action, pin }),
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} ${res.statusText} - ${msg || "No se pudo emitir el comando"}`);
  }
  return res.json();
}
