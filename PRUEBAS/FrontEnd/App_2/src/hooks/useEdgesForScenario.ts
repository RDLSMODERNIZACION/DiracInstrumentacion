// src/hooks/useEdgesForScenario.ts
import { useMemo } from "react";

// Tipo de edge que viene del backend
export type EdgeDTO = {
  a: string;
  b: string;
  relacion?: string;
  prioridad?: number;
};

export type Pipe = "8" | "10" | "G" | undefined;

export type EdgeOut = {
  a: string;
  b: string;
  pipe?: Pipe;
  active: boolean;
};

/**
 * Hook genérico para filtrar o marcar edges activos según un escenario o lógica del backend.
 * Ya no depende de EDGES_BASE ni SCENARIOS estáticos.
 */
export default function useEdgesForScenario(
  edges: EdgeDTO[],
  scenario?: {
    name: string;
    activeKeys: string[]; // ej: ["pump:1>tank:1", "pump:2>tank:2"]
  }
) {
  return useMemo<EdgeOut[]>(() => {
    if (!edges || edges.length === 0) return [];

    // Set de edges activos (si el escenario lo define)
    const activeSet = new Set(scenario?.activeKeys ?? []);

    return edges.map((e) => {
      const key = `${e.a}>${e.b}`;
      const active = scenario ? activeSet.has(key) : true;

      // Convertir prioridad o relacion a tipo de caño (pipe) opcionalmente
      let pipe: Pipe = undefined;
      if (e.relacion?.includes("gravedad")) pipe = "G";
      else if (e.prioridad === 10) pipe = "10";
      else if (e.prioridad === 8) pipe = "8";

      return { a: e.a, b: e.b, pipe, active };
    });
  }, [edges, scenario]);
}
