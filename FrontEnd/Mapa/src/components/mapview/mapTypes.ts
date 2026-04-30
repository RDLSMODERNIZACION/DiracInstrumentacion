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
};

export type PipeConnHint = {
  from_node: string | null;
  to_node: string | null;
  connected: boolean;
};
