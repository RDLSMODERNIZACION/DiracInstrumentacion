import { useAuthedFetch } from "./auth";

export function useApi() {
  const api = useAuthedFetch();

  async function getJSON(path: string) {
    const res = await api(path);
    if (!res.ok) throw new Error(`GET ${path} -> ${res.status}`);
    return res.json();
  }
  async function postJSON(path: string, body: any) {
    const res = await api(path, { method: "POST", body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`POST ${path} -> ${res.status}`);
    return res.json();
  }
  async function patchJSON(path: string, body: any) {
    const res = await api(path, { method: "PATCH", body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`PATCH ${path} -> ${res.status}`);
    return res.json();
  }
  async function del(path: string) {
    const res = await api(path, { method: "DELETE" });
    if (!res.ok) throw new Error(`DELETE ${path} -> ${res.status}`);
    return res.json().catch(() => ({}));
  }

  return { getJSON, postJSON, patchJSON, del };
}
