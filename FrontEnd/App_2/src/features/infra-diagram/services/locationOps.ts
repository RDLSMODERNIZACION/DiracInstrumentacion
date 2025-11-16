// src/features/infra-diagram/services/locationOps.ts
export async function triggerLocationAlarm(location_id: number): Promise<void> {
  const res = await fetch("/infraestructura/location_alarm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      location_id,
      action: "on", // luces + sirena ON
    }),
  });

  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const data = await res.json();
      msg = data?.detail || data?.message || msg;
    } catch {
      // ignore
    }
    throw new Error(msg);
  }
}
