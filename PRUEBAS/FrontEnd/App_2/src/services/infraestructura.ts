import { api } from "./api";

/** Actualiza la posición de un nodo en el backend */
export async function updateLayout(node_id: string, x: number, y: number) {
  const url = `/infraestructura/update_layout`;
  const payload = { node_id, x, y };
  const { data } = await api.post(url, payload);
  return data as { ok: boolean; node_id: string; x: number; y: number; table: string };
}
