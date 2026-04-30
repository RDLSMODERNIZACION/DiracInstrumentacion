// src/components/PipesLayer.tsx
import React from "react";
import { GeoJSON, useMap } from "react-leaflet";
import L from "leaflet";

import { fetchPipesBBox, fetchPipesAll } from "../services/mapasagua";

/**
 * Resultado de simulación (backend /mapa/sim/run)
 * - model puede ser "SIMPLE" o "LINEAR"
 * - nodes puede traer head_m/pressure_bar null y reached=false
 * - pipes puede traer dH_m null si está bloqueada/no alcanzada
 */
export type SimRunResponse = {
  model: "SIMPLE" | "LINEAR" | string;
  nodes?: Record<
    string,
    { head_m: number | null; pressure_bar: number | null; blocked?: boolean; kind?: string; reached?: boolean }
  >;
  pipes?: Record<
    string,
    {
      q_lps: number;
      abs_q_lps: number;
      dir: 1 | -1;
      dH_m?: number | null;
      blocked?: boolean;
      u?: string;
      v?: string;
      R?: number;
      length_m?: number;
      diam_mm?: number;
    }
  >;
  meta?: Record<string, any>;
};

export type PipeConnectivityStats = {
  total: number;
  connected: number;
  unconnected: number;
};

type Props = {
  visible?: boolean;
  useBBox?: boolean;
  debounceMs?: number;

  onSelect?: (pipeId: string, layer: L.Layer, label?: string | null, feature?: any) => void;
  onCount?: (n: number) => void;
  onConnectivityStats?: (stats: PipeConnectivityStats) => void;

  selectedId?: string | null;
  styleFn?: (feature: any) => L.PathOptions;

  /** congela fetch/listeners mientras editás (pero mantiene líneas visibles) */
  freeze?: boolean;

  /** log SOLO click (si querés) */
  debug?: boolean;

  /** estado de simulación para pintar caudales/sentido */
  sim?: SimRunResponse | null;

  /** resalta pipes sin conectar como punteado */
  highlightUnconnected?: boolean;

  /** aplica estilo de simulación (grosor por caudal) si no pasás styleFn */
  simStyle?: boolean;

  /** muestra flechas de simulación */
  showArrows?: boolean;
};

function pickLabel(feature: any): string | null {
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

function featureId(feature: any): string | null {
  if (feature?.id != null) return String(feature.id);
  if (feature?.properties?.id != null) return String(feature.properties.id);
  if (feature?.properties?.pipe_id != null) return String(feature.properties.pipe_id);
  return null;
}

function normalizeConnValue(v: any): string | null {
  if (v == null) return null;

  if (typeof v === "object") {
    if (v.id != null) return normalizeConnValue(v.id);
    if (v.node_id != null) return normalizeConnValue(v.node_id);
    return null;
  }

  const s = String(v).trim();
  if (!s) return null;

  const bad = new Set(["null", "undefined", "none", "nan", "sin conectar", "unconnected", "-"]);
  if (bad.has(s.toLowerCase())) return null;

  return s;
}

function pickFirstConn(...values: any[]) {
  for (const v of values) {
    const n = normalizeConnValue(v);
    if (n) return n;
  }
  return null;
}

function getConnHint(feature: any): { from_node: string | null; to_node: string | null; connected: boolean } {
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

function computeConnectivityStats(data: any): PipeConnectivityStats {
  const features = Array.isArray(data?.features) ? data.features : [];
  let connected = 0;
  let unconnected = 0;

  for (const f of features) {
    const conn = getConnHint(f);
    if (conn.connected) connected += 1;
    else unconnected += 1;
  }

  return { total: features.length, connected, unconnected };
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}
function weightFromAbsQ(absQ: number) {
  const w = 2 + Math.log10(1 + Math.max(0, absQ)) * 4;
  return clamp(w, 2, 10);
}
function fmt(n: number) {
  if (!isFinite(n)) return "-";
  const a = Math.abs(n);
  if (a >= 100) return n.toFixed(0);
  if (a >= 10) return n.toFixed(1);
  return n.toFixed(2);
}
function escapeHtml(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
function shortId(s: string | null) {
  if (!s) return "—";
  return s.length > 12 ? `${s.slice(0, 8)}…` : s;
}

export default function PipesLayer({
  visible = true,
  useBBox = true,
  debounceMs = 300,
  onSelect,
  onCount,
  onConnectivityStats,
  selectedId = null,
  styleFn,
  freeze = false,
  debug = false,
  sim = null,
  highlightUnconnected = true,
  simStyle = true,
  showArrows = true,
}: Props) {
  // ✅ HOOKS SIEMPRE ARRIBA (no condicionales)
  const map = useMap();
  const [data, setData] = React.useState<any>(null);
  const [error, setError] = React.useState<string | null>(null);

  // candado freeze
  const freezeRef = React.useRef<boolean>(freeze);
  React.useEffect(() => {
    freezeRef.current = freeze;
  }, [freeze]);

  // flechas layer group (ref estable)
  const arrowLayerRef = React.useRef<L.LayerGroup | null>(null);

  // =========
  // FETCH PIPES
  // =========
  React.useEffect(() => {
    if (!visible) return;

    // si estamos editando, no enganchamos listeners ni hacemos fetch (mantener data)
    if (freeze) return;

    let cancelled = false;
    let t: any = null;

    const load = async () => {
      try {
        setError(null);

        const json = useBBox
          ? await fetchPipesBBox({
              min_lng: map.getBounds().getWest(),
              min_lat: map.getBounds().getSouth(),
              max_lng: map.getBounds().getEast(),
              max_lat: map.getBounds().getNorth(),
            })
          : await fetchPipesAll();

        if (cancelled) return;
        if (freezeRef.current) return;

        setData(json);
        const n = Array.isArray(json?.features) ? json.features.length : 0;
        onCount?.(n);
        onConnectivityStats?.(computeConnectivityStats(json));
      } catch (e: any) {
        if (cancelled) return;
        if (freezeRef.current) return;
        setError(e?.message ?? String(e));
      }
    };

    const debouncedLoad = () => {
      if (!useBBox) return;
      if (t) clearTimeout(t);
      t = setTimeout(load, debounceMs);
    };

    load();
    map.on("moveend", debouncedLoad);
    map.on("zoomend", debouncedLoad);

    return () => {
      cancelled = true;
      map.off("moveend", debouncedLoad);
      map.off("zoomend", debouncedLoad);
      if (t) clearTimeout(t);
    };
  }, [visible, useBBox, debounceMs, map, onCount, onConnectivityStats, freeze]);

  // =========
  // ARROWS (SIM)
  // =========
  React.useEffect(() => {
    // limpiar capa anterior
    if (arrowLayerRef.current) {
      arrowLayerRef.current.remove();
      arrowLayerRef.current = null;
    }

    if (!showArrows) return;
    if (!visible) return;
    if (!sim?.pipes) return;
    if (!data?.features || !Array.isArray(data.features)) return;

    const grp = L.layerGroup();
    arrowLayerRef.current = grp;
    grp.addTo(map);

    const arrowIcon = L.divIcon({
      className: "pipe-arrow-icon",
      html: `<div style="width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;border-top:12px solid rgba(255,255,255,0.88);filter:drop-shadow(0 2px 4px rgba(0,0,0,.55));"></div>`,
      iconSize: [14, 14],
      iconAnchor: [7, 7],
    });

    function midpoint(coords: any[]): [number, number] | null {
      if (!Array.isArray(coords) || coords.length < 2) return null;
      const midIdx = Math.floor(coords.length / 2);
      const a = coords[midIdx - 1] ?? coords[0];
      const b = coords[midIdx] ?? coords[coords.length - 1];
      if (!a || !b) return null;
      return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    }

    function bearingDeg(a: [number, number], b: [number, number]) {
      const toRad = (x: number) => (x * Math.PI) / 180;
      const toDeg = (x: number) => (x * 180) / Math.PI;
      const lon1 = toRad(a[0]);
      const lat1 = toRad(a[1]);
      const lon2 = toRad(b[0]);
      const lat2 = toRad(b[1]);
      const dLon = lon2 - lon1;
      const y = Math.sin(dLon) * Math.cos(lat2);
      const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
      let brng = toDeg(Math.atan2(y, x));
      brng = (brng + 360) % 360;
      return brng;
    }

    for (const f of data.features) {
      const id = featureId(f);
      if (!id) continue;

      const ps = sim.pipes[id];
      if (!ps) continue;

      const absQ = typeof ps.abs_q_lps === "number" ? ps.abs_q_lps : Math.abs(ps.q_lps ?? 0);
      if (ps.blocked || absQ < 0.001) continue;

      const geom = f.geometry;
      if (!geom) continue;

      let coords: any[] | null = null;
      if (geom.type === "LineString") coords = geom.coordinates;
      else if (geom.type === "MultiLineString") coords = geom.coordinates?.[0] ?? null;
      if (!coords || coords.length < 2) continue;

      const coordsDir = ps.dir === -1 ? [...coords].reverse() : coords;

      const mid = midpoint(coordsDir);
      if (!mid) continue;

      const mi = Math.floor(coordsDir.length / 2);
      const p1 = coordsDir[Math.max(0, mi - 1)];
      const p2 = coordsDir[Math.min(coordsDir.length - 1, mi)];
      if (!p1 || !p2) continue;

      const brng = bearingDeg([p1[0], p1[1]], [p2[0], p2[1]]);

      const m = L.marker([mid[1], mid[0]], {
        icon: arrowIcon,
        interactive: false,
        keyboard: false,
      });

      m.on("add", () => {
        const el = (m as any)._icon as HTMLElement | undefined;
        if (!el) return;
        el.style.transformOrigin = "center";
        el.style.transform += ` rotate(${brng}deg)`;
        el.style.opacity = "0.95";
        el.style.pointerEvents = "none";
      });

      grp.addLayer(m);
    }

    return () => {
      if (arrowLayerRef.current) {
        arrowLayerRef.current.remove();
        arrowLayerRef.current = null;
      }
    };
  }, [map, visible, showArrows, sim, data]);

  // =========
  // SAFE early returns (DESPUÉS de hooks)
  // =========
  if (!visible) return null;
  if (error) {
    console.warn("PipesLayer error:", error);
    if (!data) return null;
  }
  if (!data) return null;

  // =========
  // Default style (incluye SIM + conexión)
  // =========
  const defaultStyle: (feature: any) => L.PathOptions = (feature) => {
    const s = (feature?.properties as any)?.style ?? {};
    const id = featureId(feature);
    const isSel = selectedId != null && id != null && String(id) === String(selectedId);

    const conn = getConnHint(feature);
    const unconnected = !conn.connected;

    let color = s.color ?? "#38bdf8";
    let weight = s.weight ?? 3;
    let opacity = s.opacity ?? 0.86;
    let dashArray: string | undefined = undefined;

    if (highlightUnconnected && unconnected) {
      color = "#f59e0b";
      weight = Math.max(Number(weight) || 3, 5);
      opacity = 0.98;
      dashArray = "8 7";
    }

    if (simStyle && id && sim?.pipes && sim.pipes[id]) {
      const ps = sim.pipes[id];
      const absQ = typeof ps.abs_q_lps === "number" ? ps.abs_q_lps : Math.abs(ps.q_lps ?? 0);
      weight = weightFromAbsQ(absQ);

      if (ps.blocked) {
        color = "#ef4444";
        opacity = 0.82;
        dashArray = "3 8";
      } else if (absQ >= 0.001) {
        color = "#22c55e";
        opacity = 1;
        dashArray = undefined;
      } else {
        opacity = 0.5;
      }
    }

    if (isSel) {
      color = "rgba(255,255,255,0.96)";
      weight = Math.max(7, Number(weight) || 7);
      opacity = 1.0;
    }

    return {
      color,
      weight,
      opacity,
      dashArray,
      lineCap: "round",
      lineJoin: "round",
    };
  };

  function bindTooltip(layer: L.Layer, feature: any) {
    const id = featureId(feature);
    const label = pickLabel(feature);
    const ps = id && sim?.pipes ? sim.pipes[id] : null;

    const conn = getConnHint(feature);
    const unconnected = !conn.connected;

    const statusStyle = unconnected
      ? "background:#f59e0b;color:#111827"
      : "background:#16a34a;color:#ffffff";

    const lines: string[] = [];
    if (label) lines.push(`<b>${escapeHtml(label)}</b>`);
    if (id) lines.push(`<div style="opacity:.72;font-size:11px">id: ${escapeHtml(id)}</div>`);

    lines.push(
      `<div style="margin-top:6px;display:inline-flex;align-items:center;gap:6px;padding:3px 7px;border-radius:999px;font-size:11px;font-weight:800;${statusStyle}">${
        unconnected ? "SIN CONECTAR" : "CONECTADA"
      }</div>`
    );

    if (conn.connected) {
      lines.push(
        `<div style="margin-top:5px;font-size:11px;opacity:.78">Origen: <b>${escapeHtml(
          shortId(conn.from_node)
        )}</b> · Destino: <b>${escapeHtml(shortId(conn.to_node))}</b></div>`
      );
    } else {
      lines.push(
        `<div style="margin-top:5px;color:#b45309;font-size:12px;font-weight:700">Falta origen o destino. No entra en simulación.</div>`
      );
    }

    if (ps) {
      const q = ps.q_lps ?? 0;
      const dh = ps.dH_m ?? null;
      lines.push(`<div style="margin-top:5px"><b>Q</b>: ${fmt(q)} L/s (${ps.dir === 1 ? "from→to" : "to→from"})</div>`);
      lines.push(`<div><b>ΔH</b>: ${dh == null ? "N/D" : fmt(dh)} m</div>`);
      if (ps.blocked) lines.push(`<div style="color:#991b1b;font-weight:800">BLOQUEADO</div>`);
    } else if (sim && id) {
      lines.push(`<div style="opacity:.72;margin-top:5px">Sin datos de simulación</div>`);
    }

    const html = `<div style="min-width:230px">${lines.join("")}</div>`;
    try {
      (layer as any).bindTooltip(html, { sticky: true, direction: "top" });
    } catch {}
  }

  return (
    <>
      <style>
        {`
          .pipe-arrow-icon {
            background: transparent !important;
            border: 0 !important;
          }
        `}
      </style>

      <GeoJSON
        data={data}
        style={styleFn ?? defaultStyle}
        onEachFeature={(feature, layer) => {
          const id = featureId(feature);
          const label = pickLabel(feature);

          bindTooltip(layer, feature);

          layer.on("click", (e: any) => {
            try {
              L.DomEvent.stopPropagation(e);
            } catch {}

            if (debug) {
              try {
                const gtype = feature?.geometry?.type;
                const layerType = (layer as any)?.constructor?.name ?? typeof layer;
                const hasPm = !!(layer as any)?.pm;
                const conn = getConnHint(feature);
                console.log("[PIPE CLICK]", { id, label, conn, geometryType: gtype, layerType, hasPm });
              } catch {}
            }

            if (!id) return;
            onSelect?.(id, layer, label, feature);
          });
        }}
      />
    </>
  );
}