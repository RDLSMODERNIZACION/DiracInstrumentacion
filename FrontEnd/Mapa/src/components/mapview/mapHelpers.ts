import { fetchNodes } from "../../services/mapasagua";
import type { NodeLite, PipeConnHint } from "./mapTypes";

export function pressureLabelForBarrio(b: any): { label: string; tone: "good" | "mid" | "bad" | "na" } {
  const m = (b?.meta ?? {}) as any;

  const kpa = typeof m.presion_kpa === "number" ? m.presion_kpa : null;
  const bar = typeof m.presion_bar === "number" ? m.presion_bar : null;
  const pct = typeof m.presion_pct === "number" ? m.presion_pct : null;

  if (bar != null) {
    if (bar >= 2.2) return { label: `Presión: Buena (${bar.toFixed(1)} bar)`, tone: "good" };
    if (bar >= 1.6) return { label: `Presión: Media (${bar.toFixed(1)} bar)`, tone: "mid" };
    return { label: `Presión: Mala (${bar.toFixed(1)} bar)`, tone: "bad" };
  }

  if (kpa != null) {
    if (kpa >= 220) return { label: `Presión: Buena (${Math.round(kpa)} kPa)`, tone: "good" };
    if (kpa >= 160) return { label: `Presión: Media (${Math.round(kpa)} kPa)`, tone: "mid" };
    return { label: `Presión: Mala (${Math.round(kpa)} kPa)`, tone: "bad" };
  }

  if (pct != null) {
    if (pct >= 75) return { label: `Presión: Buena (${Math.round(pct)}%)`, tone: "good" };
    if (pct >= 45) return { label: `Presión: Media (${Math.round(pct)}%)`, tone: "mid" };
    return { label: `Presión: Mala (${Math.round(pct)}%)`, tone: "bad" };
  }

  return { label: "Presión: N/D", tone: "na" };
}

export async function fetchNodesLiteSafe(): Promise<NodeLite[]> {
  try {
    const items = await fetchNodes(5000);

    return items
      .map((x: any) => ({
        id: String(x?.id ?? ""),
        kind: x?.kind ? String(x.kind) : undefined,
        label: x?.label ? String(x.label) : undefined,
        lat: x?.lat != null ? Number(x.lat) : undefined,
        lng: x?.lng != null ? Number(x.lng) : undefined,
      }))
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

  if (["null", "undefined", "none", "nan", "sin conectar", "unconnected", "-"].includes(s.toLowerCase())) {
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
