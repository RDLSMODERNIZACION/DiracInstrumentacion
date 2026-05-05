import type L from "leaflet";

export type SimPressureKind =
  | "REAL"
  | "TANK"
  | "MANUAL"
  | "CALC"
  | "MIXED"
  | "BLOCKED"
  | string;

export type SimSource = {
  source_id?: string | null;
  source_type?: string | null;
  source_group?: string | null;
  pressure_kind?: SimPressureKind | null;

  asset_link_id?: string | null;
  asset_type?: string | null;
  asset_id?: string | null;

  label?: string | null;
  head_m?: number | null;

  pressure_bar_real?: number | null;
  level_pct?: number | null;
  tank_height_m?: number | null;
  water_height_m?: number | null;

  pressure_mca_at_node?: number | null;
  pressure_bar_at_node?: number | null;
  delta_to_dominant_m?: number | null;

  online?: boolean | null;
  age_sec?: number | null;
  live_status?: string | null;

  props?: Record<string, any> | null;
};

export type SimNode = {
  head_m: number | null;
  elev_m?: number | null;
  pressure_mca?: number | null;
  pressure_bar: number | null;

  blocked?: boolean;
  valve_closed?: boolean;

  kind?: string;
  label?: string | null;
  reached?: boolean;

  is_source?: boolean;
  pressure_kind?: SimPressureKind | null;

  source?: SimSource | null;
  dominant_source?: SimSource | null;
  origin_source?: SimSource | null;

  sources_reaching?: SimSource[];
  sources_reaching_count?: number;

  source_mix?: string | null;
  warnings?: string[];

  is_pressure_real?: boolean;
  is_pressure_theoretical?: boolean;
};

export type SimPipe = {
  q_lps: number;
  abs_q_lps: number;
  dir: 1 | -1;

  dH_m?: number | null;
  blocked?: boolean;
  valve_closed?: boolean;

  u?: string | null;
  v?: string | null;

  R?: number | null;
  length_m?: number | null;
  diam_mm?: number | null;

  pressure_mca_u?: number | null;
  pressure_mca_v?: number | null;
  pressure_mca_avg?: number | null;
  pressure_mca_min?: number | null;
  pressure_mca_max?: number | null;

  pressure_bar_u?: number | null;
  pressure_bar_v?: number | null;
  pressure_bar_avg?: number | null;
  pressure_bar_min?: number | null;
  pressure_bar_max?: number | null;

  pressure_kind_u?: SimPressureKind | null;
  pressure_kind_v?: SimPressureKind | null;
  pressure_kind?: SimPressureKind | null;

  origin_source_u?: SimSource | null;
  origin_source_v?: SimSource | null;

  sources_reaching?: SimSource[];
  sources_reaching_count?: number;

  source_mix?: string | null;
  warnings?: string[];

  flow_func?: string | null;
  pipe_role?: string | null;
};

export type SimRunResponse = {
  model: "SIMPLE" | "LINEAR" | string;

  nodes?: Record<string, SimNode>;
  pipes?: Record<string, SimPipe>;
  sources?: SimSource[];

  meta?: {
    n_nodes?: number;
    n_pipes_used?: number;
    n_sources?: number;

    pipes_count?: number;
    nodes_count?: number;
    sources_count?: number;
    sources_valid?: number;
    sources_invalid?: number;
    sources_blocked?: number;

    pipes_unconnected?: number;
    pipes_closed?: number;
    pipes_closed_by_valve?: number;
    pipes_blocked_by_valve?: number;

    valves_total?: number;
    valves_on_nodes?: number;
    valves_on_pipes?: number;
    closed_node_valves?: number;
    closed_pipe_valves?: number;

    demands_ignored?: boolean;
    pressure_formula?: string;
    sources_origin?: string;
    source_mix_logic?: string;

    valve_logic?: Record<string, any>;
    pressure_kinds?: Record<string, string>;
    source_mix_types?: Record<string, string>;
    warnings_catalog?: Record<string, string>;

    [key: string]: any;
  };
};

export type PipeConnectivityStats = {
  total: number;
  connected: number;
  unconnected: number;
};

export type PipeLayerProps = {
  visible?: boolean;
  useBBox?: boolean;
  debounceMs?: number;

  onSelect?: (
    pipeId: string,
    layer: L.Layer,
    label?: string | null,
    feature?: any,
    latlng?: L.LatLng
  ) => void | Promise<void>;

  onCount?: (n: number) => void;
  onConnectivityStats?: (stats: PipeConnectivityStats) => void;

  selectedId?: string | null;
  styleFn?: (feature: any) => L.PathOptions;

  freeze?: boolean;
  debug?: boolean;

  sim?: SimRunResponse | null;

  highlightUnconnected?: boolean;
  simStyle?: boolean;
  showArrows?: boolean;
  colorByPressure?: boolean;
  showOnlySimulated?: boolean;
};

export type PipeConnHint = {
  from_node: string | null;
  to_node: string | null;
  connected: boolean;
};

export type PipeRole = {
  key: "impulsion" | "distribucion" | "ramal";
  label: string;
  color: string;
  dashArray?: string;
};