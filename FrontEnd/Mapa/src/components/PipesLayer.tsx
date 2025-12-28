// src/components/PipesLayer.tsx
import React from "react";
import { GeoJSON, useMap } from "react-leaflet";
import L from "leaflet";

import { fetchPipesBBox, fetchPipesAll } from "../services/mapasagua";

/**
 * Resultado de simulación (backend /mapa/sim/run)
 */
export type SimRunResponse = {
  model: "LINEAR" | string;
  nodes?: Record<string, { head_m: number; pressure_bar: number; blocked?: boolean; kind?: string }>;
  pipes?: Record<
    string,
    {
      q_lps: number;
      abs_q_lps: number;
      dir: 1 | -1;
      dH_m?: number;
      blocked?: boolean;
      u?: string;
      v?: string;
    }
  >;
  meta?: Record<string, any>;
};

type Props = {
  visible?: boolean;
  useBBox?: boolean;
  debounceMs?: number;

  onSelect?: (pipeId: string, layer: L.Layer, label?: string | null, feature?: any) => void;
  onCount?: (n: number) => void;

  selectedId?: string | null;
  styleFn?: (feature: any) => L.PathOptions;

  /** congela fetch/listeners mientras editás (pero mantiene líneas visibles) */
  freeze?: boolean;

  /** log SOLO click (si querés) */
  debug?: boolean;

  /** estado de simulación para pintar caudales/sentido */
  sim?: SimRunResponse | null;

  /** resalta pipes sin conectar como punteado (si el GeoJSON trae from/to en properties o props) */
  highlightUnconnected?: boolean;

  /** aplica estilo de simulación (grosor por caudal) si no pasás styleFn */
  simStyle?: boolean;

  /** muestra flechas de simulación */
  showArrows?: boolean;
};

function pickLabel(feature: any): string | null {
  const a = feature?.properties?.props?.Layer;
  if (typeof a === "string" && a.trim()) return a.trim();

  const b = feature?.properties?.props?.layer;
  if (typeof b === "string" && b.trim()) return b.trim();

  const c = feature?.properties?.Layer;
  if (typeof c === "string" && c.trim()) return c.trim();

  const d = feature?.properties?.name;
  if (typeof d === "string" && d.trim()) return d.trim();

  return null;
}

function featureId(feature: any): string | null {
  if (feature?.id != null) return String(feature.id);
  if (feature?.properties?.id != null) return String(feature.properties.id);
  return null;
}

function getConnHint(feature: any): { from_node?: string | null; to_node?: string | null } {
  const p = feature?.properties ?? {};
  const props = p?.props ?? {};
  const from_node =
    (p.from_node ?? p.fromNode ?? props.from_node ?? props.fromNode ?? null) as string | null;
  const to_node =
    (p.to_node ?? p.toNode ?? props.to_node ?? props.toNode ?? null) as string | null;
  return { from_node, to_node };
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

export default function PipesLayer({
  visible = true,
  useBBox = true,
  debounceMs = 300,
  onSelect,
  onCount,
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
  }, [visible, useBBox, debounceMs, map, onCount, freeze]);

  // =========
  // ARROWS (SIM)
  // =========
  React.useEffect(() => {
    // siempre limpiar la capa anterior (si existe)
    if (arrowLayerRef.current) {
      arrowLayerRef.current.remove();
      arrowLayerRef.current = null;
    }

    // condiciones para dibujar flechas
    if (!showArrows) return;
    if (!visible) return;
    if (!sim?.pipes) return;
    if (!data?.features || !Array.isArray(data.features)) return;

    const grp = L.layerGroup();
    arrowLayerRef.current = grp;
    grp.addTo(map);

    const arrowIcon = L.divIcon({
      className: "pipe-arrow-icon",
      html: `<div style="width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;border-top:12px solid rgba(0,0,0,0.65);"></div>`,
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
      const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * math.cos(lat2) * Math.cos(dLon);
      let brng = toDeg(Math.atan2(y, x));
      brng = (brng + 360) % 360;
      return brng;
    }

    // OJO: typo arriba: "math.cos" no existe -> lo corregimos aquí:
    function bearingDegFixed(a: [number, number], b: [number, number]) {
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

      const brng = bearingDegFixed([p1[0], p1[1]], [p2[0], p2[1]]);

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
        el.style.opacity = "0.9";
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
  // Default style (incluye SIM)
  // =========
  const defaultStyle: (feature: any) => L.PathOptions = (feature) => {
    const s = (feature?.properties as any)?.style ?? {};
    const id = featureId(feature);
    const isSel = selectedId != null && id != null && String(id) === String(selectedId);

    let color = s.color ?? "#2563eb";
    let weight = s.weight ?? 3;
    let opacity = s.opacity ?? 0.85;
    let dashArray: string | undefined = undefined;

    const { from_node, to_node } = getConnHint(feature);
    const unconnected = !from_node || !to_node;

    if (highlightUnconnected && unconnected) {
      dashArray = "6 6";
      opacity = Math.min(opacity, 0.55);
    }

    if (simStyle && id && sim?.pipes && sim.pipes[id]) {
      const ps = sim.pipes[id];
      const absQ = typeof ps.abs_q_lps === "number" ? ps.abs_q_lps : Math.abs(ps.q_lps ?? 0);
      weight = weightFromAbsQ(absQ);

      if (ps.blocked) {
        opacity = 0.35;
        dashArray = dashArray ?? "2 8";
      } else {
        opacity = Math.max(opacity, 0.9);
      }
    }

    if (isSel) {
      color = "rgba(255,255,255,0.95)";
      weight = Math.max(6, weight);
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

    const { from_node, to_node } = getConnHint(feature);
    const unconnected = !from_node || !to_node;

    const lines: string[] = [];
    if (label) lines.push(`<b>${escapeHtml(label)}</b>`);
    if (id) lines.push(`<div style="opacity:.7;font-size:11px">id: ${escapeHtml(id)}</div>`);
    if (unconnected) lines.push(`<div style="color:#b45309;font-weight:600">SIN CONECTAR</div>`);

    if (ps) {
      const q = ps.q_lps ?? 0;
      const dh = ps.dH_m ?? 0;
      lines.push(`<div><b>Q</b>: ${fmt(q)} L/s (${ps.dir === 1 ? "from→to" : "to→from"})</div>`);
      lines.push(`<div><b>ΔH</b>: ${fmt(dh)} m</div>`);
      if (ps.blocked) lines.push(`<div style="color:#991b1b;font-weight:600">BLOQUEADO</div>`);
    } else if (sim && id) {
      lines.push(`<div style="opacity:.7">Sin datos de simulación</div>`);
    }

    const html = `<div style="min-width:220px">${lines.join("")}</div>`;
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
