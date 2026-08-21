import { fetchJSON } from "./data";

export type PumpAvailability = {
  id: number;
  name?: string | null;
  location_id?: number | null;
  rol_red?: "impulsion_principal" | "secundaria" | "excluir" | null;
  disponible: boolean;
  disponibilidad_actualizada_at?: string | null;
};

export async function getPumpAvailability(
  pumpId: number
): Promise<PumpAvailability> {
  return fetchJSON<PumpAvailability>(
    `/infraestructura/pump_availability/${pumpId}`
  );
}

export async function listPumpAvailability(): Promise<PumpAvailability[]> {
  return fetchJSON<PumpAvailability[]>(
    "/infraestructura/pump_availability"
  );
}

export async function savePumpAvailability(
  pumpId: number,
  disponible: boolean
): Promise<PumpAvailability> {
  const response = await fetch(
    `/infraestructura/pump_availability/${pumpId}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ disponible }),
    }
  );

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      text || `No se pudo actualizar disponibilidad (${response.status})`
    );
  }

  const data = await response.json();
  return data.pump as PumpAvailability;
}
