import type { LatLng } from "../../lib/geo";

export type ViewMode = "ALL" | "ZONES" | "PIPES" | "BARRIOS";

export type SimMode = "topografico" | "hidraulico_suave";

export type FocusPair =
  | {
      a: { label: string; pos: LatLng };
      b: { label: string; pos: LatLng };
    }
  | null;

export type NodeLite = {
  id: string;

  kind?: string;
  label?: string;

  lat?: number;
  lng?: number;

  /**
   * Cota del nodo en metros.
   * Esta es la altura que usa la simulación.
   */
  elev_m?: number | null;

  /**
   * Altura hidráulica/carga, si el backend la devuelve.
   */
  head_m?: number | null;

  /**
   * Demanda del nodo, si existe.
   */
  demand_lps?: number | null;

  /**
   * Marca si el nodo funciona como fuente.
   */
  is_source?: boolean;
};

export type PipeConnHint = {
  from_node: string | null;
  to_node: string | null;
  connected: boolean;
};