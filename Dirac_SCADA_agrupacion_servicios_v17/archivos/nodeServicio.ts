import { API_BASE } from "@/lib/api";
import { withScope } from "@/lib/scope";
import { authHeaders } from "@/lib/http";

export type ServicioSCADA = "agua" | "cargaderos" | "cloacas";

export async function saveNodeServicio(nodeId: string, servicio: ServicioSCADA) {
  const r = await fetch(
    withScope(`${API_BASE}/infraestructura/node_servicio`),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(),
      },
      body: JSON.stringify({ node_id: nodeId, servicio }),
    }
  );

  if (!r.ok) throw new Error(await r.text());
  return r.json();
}
