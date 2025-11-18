// src/utils/nodeDims.ts

export type Half = { halfW: number; halfH: number };

/**
 * nodeHalfSize:
 * Devuelve la mitad del tamaño de un nodo según su tipo.
 * Se usa para calcular posiciones y rutas ortogonales (Manhattan).
 *
 * Admite tipos dinámicos ("tank", "pump", "valve", "sensor", etc.).
 */
export function nodeHalfSize(type?: string | null): Half {
  const t = (type || "").toLowerCase();

  switch (t) {
    case "tank":
      return { halfW: 60, halfH: 40 }; // 120x80
    case "pump":
      return { halfW: 26, halfH: 26 }; // círculo r=26
    case "valve":
      return { halfW: 16, halfH: 10 }; // 32x20
    case "manifold":
      return { halfW: 50, halfH: 8 }; // 100x16
    case "sensor":
      return { halfW: 20, halfH: 20 };
    case "pipe":
      return { halfW: 8, halfH: 8 };
    default:
      // tamaño base genérico para nodos desconocidos
      return { halfW: 24, halfH: 24 };
  }
}
