// src/utils/layoutIO.ts

export type NodePos = { id: string; x: number; y: number };

// Clave en localStorage (puedes versionarla si cambias esquema)
const LS_KEY = "acuaducto-layout-v2";

/**
 * exportLayout:
 * Extrae las posiciones actuales de todos los nodos.
 */
export function exportLayout(nodes: { id: string; x: number; y: number }[]): NodePos[] {
  return nodes.map((n) => ({ id: n.id, x: n.x, y: n.y }));
}

/**
 * importLayout:
 * Aplica un layout a los nodos existentes, devolviendo un nuevo array.
 * Ignora nodos que no coinciden por id.
 */
export function importLayout(nodes: any[], layout: NodePos[]): any[] {
  const map = new Map(layout.map((p) => [p.id, p]));
  return nodes.map((n) => {
    const pos = map.get(n.id);
    return pos ? { ...n, x: pos.x, y: pos.y } : n;
  });
}

/**
 * Guarda el layout actual en localStorage.
 */
export function saveLayoutToStorage(nodes: { id: string; x: number; y: number }[]) {
  try {
    const json = JSON.stringify(exportLayout(nodes));
    localStorage.setItem(LS_KEY, json);
  } catch (e) {
    console.warn("Error al guardar layout:", e);
  }
}

/**
 * Carga layout desde localStorage.
 * Devuelve `NodePos[]` o `null` si no hay datos válidos.
 */
export function loadLayoutFromStorage(): NodePos[] | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return null;
    return arr as NodePos[];
  } catch {
    return null;
  }
}

/**
 * Elimina el layout guardado manualmente.
 */
export function clearSavedLayout() {
  try {
    localStorage.removeItem(LS_KEY);
  } catch (e) {
    console.warn("Error al limpiar layout:", e);
  }
}
