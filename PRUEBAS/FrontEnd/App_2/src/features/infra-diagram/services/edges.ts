// src/features/infra-diagram/services/edges.ts
import { withScope } from "@/lib/scope";
import { API_BASE } from "@/lib/api";
import type { EdgeDTO } from "../types";

export async function createEdge(params: {
  src_node_id: string;
  dst_node_id: string;
  relacion?: string;
  prioridad?: number;
}) {
  const res = await fetch(withScope(`${API_BASE}/infraestructura/edges`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // credentials: "include", // descomentá si tu auth usa cookie
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Crear conexión: HTTP ${res.status} ${res.statusText} - ${txt}`);
  }
  return res.json() as Promise<EdgeDTO>;
}

export async function deleteEdge(edge_id: number) {
  const res = await fetch(withScope(`${API_BASE}/infraestructura/edges/${edge_id}`), {
    method: "DELETE",
    // credentials: "include",
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Borrar conexión: HTTP ${res.status} ${res.statusText} - ${txt}`);
  }
  return true;
}

export async function updateEdge(
  edge_id: number,
  patch: Partial<{ relacion: string; prioridad: number }>
) {
  const res = await fetch(withScope(`${API_BASE}/infraestructura/edges/${edge_id}`), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    // credentials: "include",
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Actualizar conexión: HTTP ${res.status} ${res.statusText} - ${txt}`);
  }
  return res.json() as Promise<EdgeDTO>;
}
