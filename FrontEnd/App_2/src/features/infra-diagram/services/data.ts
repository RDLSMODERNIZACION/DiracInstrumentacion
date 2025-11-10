// src/features/infra-diagram/services/data.ts
import { API_BASE } from "@/lib/api";
import { withScope } from "@/lib/scope";

export async function fetchJSON<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(withScope(`${API_BASE}${path}`), { signal });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} ${res.statusText} - ${txt}`);
  }
  return res.json();
}

export async function updateLayout(node_id: string, x: number, y: number) {
  const res = await fetch(withScope(`${API_BASE}/infraestructura/update_layout`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // credentials: "include", // descomentá si tu auth es por cookie
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
    const res = await fetch(withScope(`${API_BASE}/infraestructura/update_layout_many`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // credentials: "include", // descomentá si tu auth es por cookie
      body: JSON.stringify({ items }),
    });
    if (!res.ok) throw new Error("fallback");
    return res.json();
  } catch {
    const chunk = 6;a
    for (let i = 0; i < items.length; i += chunk) {
      const slice = items.slice(i, i + chunk);
      await Promise.all(slice.map(({ node_id, x, y }) => updateLayout(node_id, x, y)));
    }
    return { ok: true, count: items.length };
  }
}
