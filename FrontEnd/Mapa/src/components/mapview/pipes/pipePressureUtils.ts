import type { SimRunResponse } from "./types";

export function pressureColor(bar: number | null | undefined) {
  if (bar == null || !isFinite(Number(bar))) return "#94a3b8";

  const p = Number(bar);

  if (p < 0.5) return "#ef4444";
  if (p < 1.2) return "#f97316";
  if (p < 2.0) return "#facc15";
  if (p <= 5.0) return "#22c55e";
  if (p <= 6.5) return "#38bdf8";

  return "#a855f7";
}

export function pressureLabel(bar: number | null | undefined) {
  if (bar == null || !isFinite(Number(bar))) return "Presión N/D";

  const p = Number(bar);

  if (p < 0.5) return "Muy baja";
  if (p < 1.2) return "Baja";
  if (p < 2.0) return "Aceptable baja";
  if (p <= 5.0) return "Normal";
  if (p <= 6.5) return "Alta";

  return "Sobrepresión";
}

export function pressureKindLabel(kind: string | null | undefined) {
  if (kind === "REAL") return "REAL";
  if (kind === "TANK") return "TANQUE";
  if (kind === "MANUAL") return "MANUAL";
  if (kind === "MIXED") return "MIXTA";
  if (kind === "CALC") return "TEÓRICA";
  return "N/D";
}

export function pressureKindColor(kind: string | null | undefined) {
  if (kind === "REAL") return "#8b5cf6";
  if (kind === "TANK") return "#06b6d4";
  if (kind === "MANUAL") return "#eab308";
  if (kind === "MIXED") return "#f97316";
  if (kind === "CALC") return "#64748b";
  return "#94a3b8";
}

export function warningLabel(w: string) {
  switch (w) {
    case "TANK_AND_PRESSURE_REACH_NODE":
      return "Tanque + presión llegan al sector";
    case "TANK_AND_REAL_PRESSURE_REACH_NODE":
      return "Tanque + manómetro real llegan al sector";
    case "TANK_AND_MANUAL_SOURCE_REACH_NODE":
      return "Tanque + fuente manual llegan al sector";
    case "DISTRIBUTION_FED_BY_PRESSURE":
      return "Distribución alimentada por impulsión/presión";
    case "TANK_ZONE_INVADED_BY_PRESSURE":
      return "Zona de tanque alcanzada por impulsión";
    case "MULTIPLE_TANKS_REACH_NODE":
      return "Llegan varios tanques";
    case "MULTIPLE_PRESSURE_SOURCES_REACH_NODE":
      return "Llegan varias fuentes de presión";
    default:
      return w;
  }
}

export function getPipePressureStats(sim: SimRunResponse | null | undefined, pipeId: string | null) {
  if (!sim?.pipes || !pipeId) return null;

  const ps = sim.pipes[pipeId];
  if (!ps) return null;

  const u = ps.u;
  const v = ps.v;

  const nu = u ? sim.nodes?.[u] : null;
  const nv = v ? sim.nodes?.[v] : null;

  const backendHasPressure =
    ps.pressure_bar_min != null ||
    ps.pressure_bar_avg != null ||
    ps.pressure_bar_max != null ||
    ps.pressure_bar_u != null ||
    ps.pressure_bar_v != null;

  if (backendHasPressure) {
    return {
      u,
      v,

      min_bar: ps.pressure_bar_min ?? null,
      max_bar: ps.pressure_bar_max ?? null,
      avg_bar: ps.pressure_bar_avg ?? null,

      u_bar: ps.pressure_bar_u ?? null,
      v_bar: ps.pressure_bar_v ?? null,

      u_elev_m: nu?.elev_m ?? null,
      v_elev_m: nv?.elev_m ?? null,

      u_pressure_mca: ps.pressure_mca_u ?? nu?.pressure_mca ?? null,
      v_pressure_mca: ps.pressure_mca_v ?? nv?.pressure_mca ?? null,

      pressure_kind: ps.pressure_kind ?? null,
      pressure_kind_u: ps.pressure_kind_u ?? nu?.pressure_kind ?? null,
      pressure_kind_v: ps.pressure_kind_v ?? nv?.pressure_kind ?? null,

      origin_source_u: ps.origin_source_u ?? nu?.origin_source ?? null,
      origin_source_v: ps.origin_source_v ?? nv?.origin_source ?? null,

      sources_reaching: ps.sources_reaching ?? [],
      sources_reaching_count: ps.sources_reaching_count ?? 0,
      source_mix: ps.source_mix ?? null,
      warnings: ps.warnings ?? [],

      reached: true,
    };
  }

  if (!sim?.nodes) return null;

  const pu = nu?.pressure_bar;
  const pv = nv?.pressure_bar;

  const valid = [pu, pv]
    .filter((x) => x != null && isFinite(Number(x)))
    .map(Number);

  if (!valid.length) {
    return {
      u,
      v,
      min_bar: null,
      max_bar: null,
      avg_bar: null,
      u_bar: pu ?? null,
      v_bar: pv ?? null,
      u_elev_m: nu?.elev_m ?? null,
      v_elev_m: nv?.elev_m ?? null,
      u_pressure_mca: nu?.pressure_mca ?? null,
      v_pressure_mca: nv?.pressure_mca ?? null,
      pressure_kind: ps.pressure_kind ?? null,
      pressure_kind_u: nu?.pressure_kind ?? null,
      pressure_kind_v: nv?.pressure_kind ?? null,
      origin_source_u: nu?.origin_source ?? null,
      origin_source_v: nv?.origin_source ?? null,
      sources_reaching: ps.sources_reaching ?? [],
      sources_reaching_count: ps.sources_reaching_count ?? 0,
      source_mix: ps.source_mix ?? null,
      warnings: ps.warnings ?? [],
      reached: false,
    };
  }

  const min = Math.min(...valid);
  const max = Math.max(...valid);
  const avg = valid.reduce((a, b) => a + b, 0) / valid.length;

  return {
    u,
    v,
    min_bar: min,
    max_bar: max,
    avg_bar: avg,
    u_bar: pu ?? null,
    v_bar: pv ?? null,
    u_elev_m: nu?.elev_m ?? null,
    v_elev_m: nv?.elev_m ?? null,
    u_pressure_mca: nu?.pressure_mca ?? null,
    v_pressure_mca: nv?.pressure_mca ?? null,
    pressure_kind: ps.pressure_kind ?? "CALC",
    pressure_kind_u: nu?.pressure_kind ?? null,
    pressure_kind_v: nv?.pressure_kind ?? null,
    origin_source_u: nu?.origin_source ?? null,
    origin_source_v: nv?.origin_source ?? null,
    sources_reaching: ps.sources_reaching ?? [],
    sources_reaching_count: ps.sources_reaching_count ?? 0,
    source_mix: ps.source_mix ?? null,
    warnings: ps.warnings ?? [],
    reached: true,
  };
}