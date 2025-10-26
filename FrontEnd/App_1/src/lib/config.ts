// kpiz/src/lib/config.ts
export function getApiRoot() {
  const url = import.meta.env.VITE_API_ROOT?.trim() || "http://localhost:8787";
  return url.replace(/\/$/, ""); // sin trailing slash
}

export function getApiHeaders(): HeadersInit {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  const apiKey = import.meta.env.VITE_API_KEY?.trim();
  if (apiKey) h["X-API-Key"] = apiKey; // misma clave que infraestructura
  return h;
}
