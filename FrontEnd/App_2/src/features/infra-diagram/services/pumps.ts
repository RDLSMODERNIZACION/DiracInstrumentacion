import { API_BASE } from "@/lib/api";

export async function issuePumpCommand(pumpId: number, action: "start" | "stop", pin?: string) {
  const res = await fetch(`${API_BASE}/dirac/pumps/${pumpId}/command`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include", // importante si tu auth usa cookie
    body: JSON.stringify({ action, pin }),
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} ${res.statusText} - ${msg || "No se pudo emitir el comando"}`);
  }
  return res.json();
}
