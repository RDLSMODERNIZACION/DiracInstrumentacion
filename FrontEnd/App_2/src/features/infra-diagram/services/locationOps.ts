// src/features/infra-diagram/services/locationOps.ts
export async function triggerLocationAlarm(location_id: number): Promise<void> {
  // TODO: ajustá este endpoint a tu backend real
  const res = await fetch("/dirac/ops/location/alarm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      location_id,
      action: "activate_lights_and_siren",
    }),
    credentials: "include",
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
