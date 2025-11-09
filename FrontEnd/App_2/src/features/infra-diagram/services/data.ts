import { API_BASE } from "@/lib/api";

export async function fetchJSON<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { signal });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} ${res.statusText} - ${txt}`);
  }
  return res.json();
}

export async function updateLayout(node_id: string, x: number, y: number) {
  const res = await fetch(`${API_BASE}/infraestructura/update_layout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ node_id, x, y }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Update layout: HTTP ${res.status} ${res.statusText} - ${txt}`);
  }
  return res.json();
}

export async function updateLayoutMany(items: { node_id: string; x: number; y: number }[]) {
  // Si hay endpoint batch, usalo. Si no, fallback: envía en paralelo por tandas.
  try {
    const res = await fetch(`${API_BASE}/infraestructura/update_layout_many`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    });
    if (!res.ok) throw new Error("fallback");
    return res.json();
  } catch {
    const chunk = 6;
    for (let i = 0; i < items.length; i += chunk) {
      const slice = items.slice(i, i + chunk);
      await Promise.all(slice.map(({ node_id, x, y }) => updateLayout(node_id, x, y)));
    }
    return { ok: true, count: items.length };
  }
}
