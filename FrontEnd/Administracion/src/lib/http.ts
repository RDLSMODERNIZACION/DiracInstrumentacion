export function authHeaders(): Record<string, string> {
  try {
    const raw = sessionStorage.getItem("dirac.basic");
    if (!raw) return {};
    const { basicToken } = JSON.parse(raw);
    return basicToken ? { Authorization: basicToken } : {};
  } catch {
    return {};
  }
}
