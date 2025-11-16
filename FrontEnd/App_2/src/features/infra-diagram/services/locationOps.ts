// src/services/locationOps.ts

export type LocationAlarmAction = "on" | "off" | "pulse";

/**
 * Dispara un comando de alarma para una localidad.
 *
 * @param locationId  ID de la localidad (locations.id)
 * @param action      "pulse" (default), "on" o "off"
 */
export async function triggerLocationAlarm(
  locationId: number,
  action: LocationAlarmAction = "pulse"
) {
  const res = await fetch(
    "https://diracinstrumentacion.onrender.com/infraestructura/location_alarm",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        location_id: locationId,
        action, // "pulse" | "on" | "off"
      }),
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text}`);
  }

  return res.json();
}
