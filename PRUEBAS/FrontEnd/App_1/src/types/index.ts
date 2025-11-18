export type ID = number;
avg_flow_lpm_30d: number | null;
avg_pressure_bar_30d: number | null;
pumps_last_seen: string | null;
tank_readings_30d: number;
avg_level_pct_30d: number | null;
tanks_last_seen: string | null;
};


export type LatestTanks = { tank_id: ID; ts: string; level_percent: number; volume_l: number; temperature_c: number }[];
export type LatestPumps = {
pump_id: ID;
ts: string;
is_on: boolean;
flow_lpm: number;
pressure_bar: number;
voltage_v: number;
current_a: number;
control_mode: string;
manual_lockout: boolean;
}[];


export type Analytics30d = {
pump_uptime: Record<string, { pump_id: ID; pump_name: string; on_seconds: number; total_seconds: number; uptime_pct_30d: number }>;
pump_energy_kwh: Record<string, { pump_id: ID; kwh_30d: number }>;
};


export type TopologyEdge = {
id: ID;
from_type: string;
from_id: ID;
from_name: string;
to_type: string;
to_id: ID;
to_name: string;
pipe_diameter_mm: number;
length_m: number;
is_active: boolean;
from_location_id: ID;
to_location_id: ID;
};


export type TopologyNode = {
type: "tank" | "pump" | "valve" | "manifold" | string;
asset_id: ID;
name: string;
code: string;
location_id: ID;
// opcionales
level_ratio?: number;
capacity_liters?: number;
pump_status?: string;
rated_kw?: number;
valve_state?: string;
};


export type Topology = { edges: TopologyEdge[]; nodes: TopologyNode[] };


export type Dataset = {
generated_at: string;
org: Org;
kpis: KPISet;
locations: Location[];
byLocation: ByLocation[];
assets: Assets;
latest: { tanks: LatestTanks; pumps: LatestPumps };
timeseries: Timeseries;
analytics30d: Analytics30d;
topology: Topology;
alarms: Alarm[];
};