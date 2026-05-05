import { fetchNodes } from "../../services/mapasagua";
import type { NodeLite, PipeConnHint } from "./mapTypes";

export function pressureLabelForBarrio(b: any): {
  label: string;
  tone: "good" | "mid" | "bad" | "na";
} {
  const m = (b?.meta ?? {}) as any;

  const kpa = typeof m.presion_kpa === "number" ? m.presion_kpa : null;
  const bar = typeof m.presion_bar === "number" ? m.presion_bar : null;
  const pct = typeof m.presion_pct === "number" ? m.presion_pct : null;

  if (bar != null) {
    if (bar >= 2.2) {
      return { label: `Presión: Buena (${bar.toFixed(1)} bar)`, tone: "good" };
    }

    if (bar >= 1.6) {
      return { label: `Presión: Media (${bar.toFixed(1)} bar)`, tone: "mid" };
    }

    return { label: `Presión: Mala (${bar.toFixed(1)} bar)`, tone: "bad" };
  }

  if (kpa != null) {
    if (kpa >= 220) {
      return { label: `Presión: Buena (${Math.round(kpa)} kPa)`, tone: "good" };
    }

    if (kpa >= 160) {
      return { label: `Presión: Media (${Math.round(kpa)} kPa)`, tone: "mid" };
    }

    return { label: `Presión: Mala (${Math.round(kpa)} kPa)`, tone: "bad" };
  }

  if (pct != null) {
    if (pct >= 75) {
      return { label: `Presión: Buena (${Math.round(pct)}%)`, tone: "good" };
    }

    if (pct >= 45) {
      return { label: `Presión: Media (${Math.round(pct)}%)`, tone: "mid" };
    }

    return { label: `Presión: Mala (${Math.round(pct)}%)`, tone: "bad" };
  }

  return { label: "Presión: N/D", tone: "na" };
}

function toFiniteNumber(v: any): number | undefined {
  if (v == null || v === "") return undefined;

  const n = Number(v);

  if (!Number.isFinite(n)) return undefined;

  return n;
}

function toFiniteNumberOrNull(v: any): number | null {
  const n = toFiniteNumber(v);
  return n == null ? null : n;
}

function pickNumber(...values: any[]): number | undefined {
  for (const v of values) {
    const n = toFiniteNumber(v);
    if (n != null) return n;
  }

  return undefined;
}

function pickNumberOrNull(...values: any[]): number | null {
  const n = pickNumber(...values);
  return n == null ? null : n;
}

function pickString(...values: any[]): string | undefined {
  for (const v of values) {
    if (v == null) continue;

    const s = String(v).trim();

    if (s) return s;
  }

  return undefined;
}

function pickBoolean(...values: any[]): boolean | undefined {
  for (const v of values) {
    if (typeof v === "boolean") return v;

    if (typeof v === "number") {
      if (v === 1) return true;
      if (v === 0) return false;
    }

    if (typeof v === "string") {
      const s = v.trim().toLowerCase();

      if (["true", "t", "yes", "y", "1", "si", "sí"].includes(s)) return true;
      if (["false", "f", "no", "n", "0"].includes(s)) return false;
    }
  }

  return undefined;
}

export async function fetchNodesLiteSafe(): Promise<NodeLite[]> {
  try {
    const items = await fetchNodes(5000);

    return items
      .map((x: any) => {
        const props = x?.props ?? x?.properties ?? {};

        const id = String(x?.id ?? x?.node_id ?? props?.id ?? props?.node_id ?? "");

        const lat = pickNumber(
          x?.lat,
          x?.latitude,
          x?.y,
          props?.lat,
          props?.latitude,
          props?.y
        );

        const lng = pickNumber(
          x?.lng,
          x?.lon,
          x?.longitude,
          x?.x,
          props?.lng,
          props?.lon,
          props?.longitude,
          props?.x
        );

        const elev_m = pickNumberOrNull(
          x?.elev_m,
          x?.elevation_m,
          x?.cota_m,
          x?.cota,
          x?.altura_m,
          props?.elev_m,
          props?.elevation_m,
          props?.cota_m,
          props?.cota,
          props?.altura_m
        );

        const head_m = pickNumberOrNull(
          x?.head_m,
          x?.hydraulic_head_m,
          x?.carga_m,
          props?.head_m,
          props?.hydraulic_head_m,
          props?.carga_m
        );

        const demand_lps = pickNumberOrNull(
          x?.demand_lps,
          x?.demanda_lps,
          props?.demand_lps,
          props?.demanda_lps
        );

        const is_source =
          pickBoolean(
            x?.is_source,
            x?.source,
            x?.es_fuente,
            props?.is_source,
            props?.source,
            props?.es_fuente
          ) ?? false;

        return {
          id,
          kind: pickString(x?.kind, x?.type, props?.kind, props?.type),
          label: pickString(x?.label, x?.name, props?.label, props?.name),
          lat,
          lng,
          elev_m,
          head_m,
          demand_lps,
          is_source,
        };
      })
      .filter((x: NodeLite) => !!x.id);
  } catch (e: any) {
    console.warn("No se pudieron cargar nodos para conectar cañerías:", e?.message ?? e);
    return [];
  }
}

export function normalizeConnValue(v: any): string | null {
  if (v == null) return null;

  if (typeof v === "object") {
    if (v.id != null) return normalizeConnValue(v.id);
    if (v.node_id != null) return normalizeConnValue(v.node_id);
    return null;
  }

  const s = String(v).trim();

  if (!s) return null;

  if (
    [
      "null",
      "undefined",
      "none",
      "nan",
      "sin conectar",
      "unconnected",
      "-",
    ].includes(s.toLowerCase())
  ) {
    return null;
  }

  return s;
}

export function pickFirstConn(...values: any[]) {
  for (const v of values) {
    const n = normalizeConnValue(v);

    if (n) return n;
  }

  return null;
}

export function pipeConnHintFromFeature(feature: any): PipeConnHint {
  const p = feature?.properties ?? {};
  const props = p?.props ?? {};

  const from_node = pickFirstConn(
    p.from_node,
    p.fromNode,
    p.from_node_id,
    p.fromNodeId,
    p.source_node,
    p.sourceNode,
    p.source,
    p.start_node,
    p.startNode,
    p.u,
    props.from_node,
    props.fromNode,
    props.from_node_id,
    props.fromNodeId,
    props.source_node,
    props.sourceNode,
    props.source,
    props.start_node,
    props.startNode,
    props.u
  );

  const to_node = pickFirstConn(
    p.to_node,
    p.toNode,
    p.to_node_id,
    p.toNodeId,
    p.target_node,
    p.targetNode,
    p.target,
    p.end_node,
    p.endNode,
    p.v,
    props.to_node,
    props.toNode,
    props.to_node_id,
    props.toNodeId,
    props.target_node,
    props.targetNode,
    props.target,
    props.end_node,
    props.endNode,
    props.v
  );

  return {
    from_node,
    to_node,
    connected: Boolean(from_node && to_node && from_node !== to_node),
  };
}