import type { PipeConnectivityStats, PipeConnHint } from "./types";

export function pickLabel(feature: any): string | null {
  const candidates = [
    feature?.properties?.props?.Layer,
    feature?.properties?.props?.layer,
    feature?.properties?.Layer,
    feature?.properties?.name,
    feature?.properties?.label,
  ];

  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim();
  }

  return null;
}

export function featureId(feature: any): string | null {
  if (feature?.id != null) return String(feature.id);
  if (feature?.properties?.id != null) return String(feature.properties.id);
  if (feature?.properties?.pipe_id != null) return String(feature.properties.pipe_id);

  return null;
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

  const bad = new Set([
    "null",
    "undefined",
    "none",
    "nan",
    "sin conectar",
    "unconnected",
    "-",
  ]);

  if (bad.has(s.toLowerCase())) return null;

  return s;
}

export function pickFirstConn(...values: any[]) {
  for (const v of values) {
    const n = normalizeConnValue(v);
    if (n) return n;
  }

  return null;
}

export function getConnHint(feature: any): PipeConnHint {
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

export function computeConnectivityStats(data: any): PipeConnectivityStats {
  const features = Array.isArray(data?.features) ? data.features : [];

  let connected = 0;
  let unconnected = 0;

  for (const f of features) {
    const conn = getConnHint(f);
    if (conn.connected) connected += 1;
    else unconnected += 1;
  }

  return {
    total: features.length,
    connected,
    unconnected,
  };
}

export function getProp(feature: any, ...keys: string[]) {
  const p = feature?.properties ?? {};
  const props = p?.props ?? {};

  for (const k of keys) {
    if (p?.[k] != null) return p[k];
    if (props?.[k] != null) return props[k];
  }

  return null;
}

export function escapeHtml(s: string | null | undefined) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function shortId(s: string | null | undefined) {
  if (!s) return "—";
  return s.length > 12 ? `${s.slice(0, 8)}…` : s;
}

export function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

export function fmt(n: number | null | undefined, digits = 2) {
  if (n == null) return "N/D";
  if (!isFinite(Number(n))) return "N/D";

  const x = Number(n);
  const a = Math.abs(x);

  if (a >= 100) return x.toFixed(0);
  if (a >= 10) return x.toFixed(1);

  return x.toFixed(digits);
}