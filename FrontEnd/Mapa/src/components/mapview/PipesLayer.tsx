import React from "react";
import { GeoJSON, useMap } from "react-leaflet";
import L from "leaflet";

import { fetchPipesBBox, fetchPipesAll } from "../../services/mapasagua";

/**
 * Resultado de simulación backend /mapa/sim/run
 */
export type SimRunResponse = {
  model: "SIMPLE" | "LINEAR" | string;

  nodes?: Record<
    string,
    {
      head_m: number | null;
      elev_m?: number | null;
      pressure_mca?: number | null;
      pressure_bar: number | null;
      blocked?: boolean;
      kind?: string;
      label?: string | null;
      reached?: boolean;

      is_source?: boolean;
      pressure_kind?: "REAL" | "TANK" | "MANUAL" | "CALC" | string | null;
      source?: any;
      origin_source?: any;
      is_pressure_real?: boolean;
      is_pressure_theoretical?: boolean;
    }
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

      pressure_kind_u?: "REAL" | "TANK" | "MANUAL" | "CALC" | string | null;
      pressure_kind_v?: "REAL" | "TANK" | "MANUAL" | "CALC" | string | null;
      pressure_kind?: "REAL" | "TANK" | "MANUAL" | "CALC" | "MIXED" | string | null;

      origin_source_u?: any;
      origin_source_v?: any;
    }
  >;

  sources?: any[];
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

  freeze?: boolean;
  debug?: boolean;

  sim?: SimRunResponse | null;

  highlightUnconnected?: boolean;
  simStyle?: boolean;

  /**
   * Se mantiene el nombre para no romper MapView.
   * Ya no dibuja flechas/triangulitos.
   * Ahora dibuja flujo animado simple.
   */
  showArrows?: boolean;

  /**
   * Si está activo, la simulación pinta cañerías por presión.
   */
  colorByPressure?: boolean;

  /**
   * Si está activo y hay simulación, solo dibuja cañerías que existen en sim.pipes.
   */
  showOnlySimulated?: boolean;
};

/* ============================================================
   Helpers base
============================================================ */

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

function pickFirstConn(...values: any[]) {
  for (const v of values) {
    const n = normalizeConnValue(v);
    if (n) return n;
  }

  return null;
}

function getConnHint(feature: any): {
  from_node: string | null;
  to_node: string | null;
  connected: boolean;
} {
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

  return {
    total: features.length,
    connected,
    unconnected,
  };
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function weightFromAbsQ(absQ: number) {
  const w = 2 + Math.log10(1 + Math.max(0, absQ)) * 4;
  return clamp(w, 2, 10);
}

function fmt(n: number | null | undefined, digits = 2) {
  if (n == null) return "N/D";
  if (!isFinite(Number(n))) return "N/D";

  const x = Number(n);
  const a = Math.abs(x);

  if (a >= 100) return x.toFixed(0);
  if (a >= 10) return x.toFixed(1);

  return x.toFixed(digits);
}

function escapeHtml(s: string | null | undefined) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function shortId(s: string | null | undefined) {
  if (!s) return "—";
  return s.length > 12 ? `${s.slice(0, 8)}…` : s;
}

/* ============================================================
   Presión / origen
============================================================ */

function pressureColor(bar: number | null | undefined) {
  if (bar == null || !isFinite(Number(bar))) return "#94a3b8";

  const p = Number(bar);

  if (p < 0.5) return "#ef4444";   // muy baja
  if (p < 1.2) return "#f97316";   // baja
  if (p < 2.0) return "#facc15";   // aceptable baja
  if (p <= 5.0) return "#22c55e";  // normal
  if (p <= 6.5) return "#38bdf8";  // alta

  return "#a855f7";                // sobrepresión
}

function pressureLabel(bar: number | null | undefined) {
  if (bar == null || !isFinite(Number(bar))) return "Presión N/D";

  const p = Number(bar);

  if (p < 0.5) return "Muy baja";
  if (p < 1.2) return "Baja";
  if (p < 2.0) return "Aceptable baja";
  if (p <= 5.0) return "Normal";
  if (p <= 6.5) return "Alta";

  return "Sobrepresión";
}

function pressureKindLabel(kind: string | null | undefined) {
  if (kind === "REAL") return "REAL";
  if (kind === "TANK") return "TANQUE";
  if (kind === "MANUAL") return "MANUAL";
  if (kind === "MIXED") return "MIXTA";
  if (kind === "CALC") return "TEÓRICA";
  return "N/D";
}

function pressureKindColor(kind: string | null | undefined) {
  if (kind === "REAL") return "#8b5cf6";
  if (kind === "TANK") return "#06b6d4";
  if (kind === "MANUAL") return "#eab308";
  if (kind === "MIXED") return "#f97316";
  if (kind === "CALC") return "#64748b";
  return "#94a3b8";
}

function getPipePressureStats(sim: SimRunResponse | null | undefined, pipeId: string | null) {
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
    reached: true,
  };
}

/* ============================================================
   Propiedades / tipo de cañería
============================================================ */

function getProp(feature: any, ...keys: string[]) {
  const p = feature?.properties ?? {};
  const props = p?.props ?? {};

  for (const k of keys) {
    if (p?.[k] != null) return p[k];
    if (props?.[k] != null) return props[k];
  }

  return null;
}

function getDiameterMm(feature: any, sim?: SimRunResponse | null) {
  const id = featureId(feature);
  const ps = id && sim?.pipes ? sim.pipes[id] : null;

  const raw =
    getProp(feature, "diametro_mm", "diameter_mm", "diam_mm", "diametro") ??
    ps?.diam_mm ??
    null;

  if (raw == null) return null;

  const n = Number(raw);
  if (!isFinite(n)) return null;

  return n;
}

function diameterWeight(d: number | null) {
  if (d == null) return 3;
  if (d <= 63) return 2.5;
  if (d <= 75) return 3.0;
  if (d <= 90) return 3.6;
  if (d <= 110) return 4.3;
  if (d <= 140) return 5.0;
  if (d <= 160) return 5.8;
  if (d <= 200) return 6.8;
  if (d <= 250) return 8.0;

  return 9.2;
}

function normalizeText(s: string) {
  return String(s ?? "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function inferPipeRole(feature: any) {
  const label = String(pickLabel(feature) ?? "");
  const flowFunc = String(getProp(feature, "flow_func", "flowFunc", "funcion", "función") ?? "");

  const layerTxt = normalizeText(label);
  const flowTxt = normalizeText(flowFunc);

  const explicitImpulsion =
    /IMPULS|IMPULSION/.test(flowTxt) || /IMPULS|IMPULSION/.test(layerTxt);

  if (explicitImpulsion) {
    return {
      key: "impulsion",
      label: "Impulsión",
      color: "#2563eb",
      dashArray: undefined as string | undefined,
    };
  }

  const isRamal =
    /RAMAL|SECUNDARIA|SECUNDARIO|SERVICIO|DOMICILIARIA|PVC 063|PVC 075|PVC 090/.test(layerTxt);

  if (isRamal) {
    return {
      key: "ramal",
      label: "Ramal / secundaria",
      color: "#14b8a6",
      dashArray: "4 7",
    };
  }

  const explicitDistribution =
    /DISTRIB|DISTRIBUCION|RED|MALLA|ACUEDUCTO|TRONCAL|COLECTOR|SALIDA/.test(flowTxt) ||
    /DISTRIB|DISTRIBUCION|RED|MALLA|ACUEDUCTO|TRONCAL|COLECTOR|SALIDA/.test(layerTxt);

  if (explicitDistribution) {
    return {
      key: "distribucion",
      label: "Distribución",
      color: "#16a34a",
      dashArray: "10 6",
    };
  }

  return {
    key: "distribucion",
    label: "Distribución",
    color: "#16a34a",
    dashArray: "10 6",
  };
}

/* ============================================================
   Flujo animado simple
============================================================ */

function safeNum(v: any): number | null {
  if (v == null) return null;
  const n = Number(v);
  return isFinite(n) ? n : null;
}

function reverseLineGeometry(feature: any) {
  const geom = feature?.geometry;
  if (!geom) return feature;

  if (geom.type === "LineString") {
    return {
      ...feature,
      geometry: {
        ...geom,
        coordinates: [...(geom.coordinates ?? [])].reverse(),
      },
    };
  }

  if (geom.type === "MultiLineString") {
    return {
      ...feature,
      geometry: {
        ...geom,
        coordinates: [...(geom.coordinates ?? [])]
          .reverse()
          .map((line: any[]) => [...(line ?? [])].reverse()),
      },
    };
  }

  return feature;
}

/**
 * Dirección visual:
 * - Impulsión: menor cota -> mayor cota.
 * - Distribución/ramal: mayor cota -> menor cota.
 * - Sin cotas: usa dirección hidráulica del backend.
 */
function shouldReverseForVisualFlow(
  feature: any,
  ps: any,
  sim: SimRunResponse | null | undefined
) {
  const conn = getConnHint(feature);
  const role = inferPipeRole(feature);

  const u = ps?.u ? String(ps.u) : null;
  const v = ps?.v ? String(ps.v) : null;

  const uElev = u ? safeNum(sim?.nodes?.[u]?.elev_m) : null;
  const vElev = v ? safeNum(sim?.nodes?.[v]?.elev_m) : null;

  let geometryIsUtoV: boolean | null = null;

  if (u && v && conn.from_node && conn.to_node) {
    if (conn.from_node === u && conn.to_node === v) geometryIsUtoV = true;
    if (conn.from_node === v && conn.to_node === u) geometryIsUtoV = false;
  }

  if (geometryIsUtoV == null) {
    geometryIsUtoV = true;
  }

  let desiredIsUtoV: boolean;

  if (uElev != null && vElev != null && uElev !== vElev) {
    if (role.key === "impulsion") {
      desiredIsUtoV = uElev < vElev;
    } else {
      desiredIsUtoV = uElev > vElev;
    }
  } else {
    desiredIsUtoV = ps?.dir !== -1;
  }

  return geometryIsUtoV !== desiredIsUtoV;
}

/* ============================================================
   COMPONENT
============================================================ */

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
  colorByPressure = true,
  showOnlySimulated = false,
}: Props) {
  const map = useMap();

  const [data, setData] = React.useState<any>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [mapZoom, setMapZoom] = React.useState(() => map.getZoom());

  const freezeRef = React.useRef<boolean>(freeze);
  const flowLayerRef = React.useRef<L.LayerGroup | null>(null);

  React.useEffect(() => {
    freezeRef.current = freeze;
  }, [freeze]);

  React.useEffect(() => {
    const updateZoom = () => setMapZoom(map.getZoom());

    updateZoom();
    map.on("zoomend", updateZoom);

    return () => {
      map.off("zoomend", updateZoom);
    };
  }, [map]);

  React.useEffect(() => {
    if (!visible) return;
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
  }, [visible, useBBox, debounceMs, map, freeze]);

  const visibleData = React.useMemo(() => {
    if (!data) return data;

    const allFeatures = Array.isArray(data?.features) ? data.features : [];

    const activeFeatures = allFeatures.filter((f: any) => {
      const active = f?.properties?.active;
      return active !== false;
    });

    if (!showOnlySimulated || !sim?.pipes) {
      return {
        ...data,
        features: activeFeatures,
      };
    }

    const simulatedFeatures = activeFeatures.filter((f: any) => {
      const id = featureId(f);
      if (!id) return false;

      const sp = sim.pipes?.[id];
      if (!sp) return false;
      if (sp.blocked) return false;

      return true;
    });

    return {
      ...data,
      features: simulatedFeatures,
    };
  }, [data, sim, showOnlySimulated]);

  React.useEffect(() => {
    if (!visibleData) return;

    const n = Array.isArray(visibleData?.features) ? visibleData.features.length : 0;

    onCount?.(n);
    onConnectivityStats?.(computeConnectivityStats(visibleData));
  }, [visibleData, onCount, onConnectivityStats]);

  /*
    Flujo visual simple:
    - No se dibuja de lejos.
    - No usa brillo ni flechas.
    - Es una línea blanca fina, lenta y discreta.
    - La animación se hace por JS porque Leaflet/SVG no siempre aplica CSS animation.
  */
  React.useEffect(() => {
    if (flowLayerRef.current) {
      flowLayerRef.current.remove();
      flowLayerRef.current = null;
    }

    if (!showArrows) return;
    if (!visible) return;
    if (!sim?.pipes) return;
    if (!visibleData?.features || !Array.isArray(visibleData.features)) return;

    if (mapZoom < 15.7) return;

    const flowItems = visibleData.features
      .map((f: any) => {
        const id = featureId(f);
        if (!id) return null;

        const ps = sim.pipes?.[id];
        if (!ps) return null;

        const absQ =
          typeof ps.abs_q_lps === "number"
            ? ps.abs_q_lps
            : Math.abs(ps.q_lps ?? 0);

        if (ps.blocked || absQ < 0.02) return null;

        const geom = f.geometry;
        if (!geom) return null;
        if (geom.type !== "LineString" && geom.type !== "MultiLineString") return null;

        return {
          feature: f,
          pipeSim: ps,
          absQ,
        };
      })
      .filter(Boolean)
      .sort((a: any, b: any) => b.absQ - a.absQ)
      .slice(0, 160);

    if (!flowItems.length) return;

    const grp = L.layerGroup();
    flowLayerRef.current = grp;
    grp.addTo(map);

    const flowLayers: any[] = [];
    const flowPaths: SVGPathElement[] = [];

    for (const item of flowItems as any[]) {
      const f = item.feature;
      const ps = item.pipeSim;
      const absQ = item.absQ;

      const visualFeature = shouldReverseForVisualFlow(f, ps, sim)
        ? reverseLineGeometry(f)
        : f;

      const flowWeight = clamp(weightFromAbsQ(absQ) * 0.24, 1.2, 2.8);

      const layer = L.geoJSON(visualFeature, {
        interactive: false,
        style: {
          color: "#ffffff",
          weight: flowWeight,
          opacity: 0.42,
          dashArray: "4 22",
          lineCap: "round",
          lineJoin: "round",
        } as L.PathOptions,
      });

      layer.addTo(grp);
      flowLayers.push(layer);
    }

    const raf = window.requestAnimationFrame(() => {
      for (const layer of flowLayers) {
        layer.eachLayer((subLayer: any) => {
          const el = subLayer.getElement?.() as SVGPathElement | null;
          if (!el) return;

          el.classList.add("pipe-flow-water");
          el.style.strokeDasharray = "4 22";
          el.style.strokeDashoffset = "0";
          el.style.transition = "none";
          el.style.pointerEvents = "none";

          flowPaths.push(el);
        });
      }
    });

    let offset = 0;

    const timer = window.setInterval(() => {
      offset -= 0.8;

      if (offset < -26) {
        offset = 0;
      }

      for (const path of flowPaths) {
        path.style.strokeDashoffset = String(offset);
      }
    }, 120);

    return () => {
      window.cancelAnimationFrame(raf);
      window.clearInterval(timer);

      if (flowLayerRef.current) {
        flowLayerRef.current.remove();
        flowLayerRef.current = null;
      }
    };
  }, [map, visible, showArrows, sim, visibleData, mapZoom]);

  if (!visible) return null;

  if (error) {
    console.warn("PipesLayer error:", error);
    if (!visibleData) return null;
  }

  if (!visibleData) return null;

  const defaultStyle: (feature: any) => L.PathOptions = (feature) => {
    const s = (feature?.properties as any)?.style ?? {};
    const id = featureId(feature);

    const isSel = selectedId != null && id != null && String(id) === String(selectedId);

    const conn = getConnHint(feature);
    const unconnected = !conn.connected;

    const role = inferPipeRole(feature);
    const diam = getDiameterMm(feature, sim);

    let color = s.color ?? role.color;
    let weight = diameterWeight(diam);
    let opacity = s.opacity ?? 0.9;
    let dashArray: string | undefined = role.dashArray;

    /*
      Modo normal:
      - tipo de cañería por color
      - sin conectar en naranja
    */
    if (!sim && highlightUnconnected && unconnected) {
      color = "#f59e0b";
      weight = Math.max(weight, 5);
      opacity = 0.98;
      dashArray = "8 7";
    }

    /*
      Modo simulación:
      - color principal = presión mínima del tramo
      - presión real/tanque/manual/teórica viene del backend
      - línea animada blanca = movimiento, solo de cerca
    */
    if (simStyle && id && sim?.pipes && sim.pipes[id]) {
      const ps = sim.pipes[id];
      const absQ =
        typeof ps.abs_q_lps === "number"
          ? ps.abs_q_lps
          : Math.abs(ps.q_lps ?? 0);

      const pr = getPipePressureStats(sim, id);
      const pressureForColor = pr?.min_bar ?? pr?.avg_bar ?? null;

      weight = Math.max(weight, weightFromAbsQ(absQ));
      dashArray = undefined;

      if (ps.blocked) {
        color = "#ef4444";
        opacity = 0.82;
        dashArray = "3 8";
      } else if (colorByPressure) {
        color = pressureColor(pressureForColor);
        opacity = 0.92;
      } else if (absQ >= 0.001) {
        color = "#22c55e";
        opacity = 0.88;
      } else {
        color = "#94a3b8";
        opacity = 0.35;
      }
    }

    /*
      Si hay simulación pero esta cañería no entró,
      la apagamos visualmente salvo que showOnlySimulated la haya filtrado.
    */
    if (sim && id && !sim.pipes?.[id]) {
      color = "#64748b";
      opacity = 0.16;
      dashArray = undefined;
      weight = Math.max(2, weight * 0.6);
    }

    if (isSel) {
      color = "rgba(255,255,255,0.96)";
      weight = Math.max(8, Number(weight) || 8);
      opacity = 1.0;
      dashArray = undefined;
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

    const p = feature?.properties ?? {};
    const lengthM = p.length_m ?? ps?.length_m ?? null;
    const diam = getDiameterMm(feature, sim);
    const role = inferPipeRole(feature);

    const pressure = getPipePressureStats(sim, id);

    const statusStyle = unconnected
      ? "background:#f59e0b;color:#111827"
      : "background:#16a34a;color:#ffffff";

    const pressureValueForLabel = pressure?.min_bar ?? pressure?.avg_bar;
    const pressureBadgeColor = pressureColor(pressureValueForLabel);
    const pressureText = pressureLabel(pressureValueForLabel);
    const kind = pressure?.pressure_kind ?? ps?.pressure_kind ?? null;
    const kindColor = pressureKindColor(kind);
    const kindLabel = pressureKindLabel(kind);

    const lines: string[] = [];

    if (label) lines.push(`<b>${escapeHtml(label)}</b>`);
    if (id) lines.push(`<div style="opacity:.72;font-size:11px">id: ${escapeHtml(id)}</div>`);

    lines.push(
      `<div style="margin-top:6px;display:inline-flex;align-items:center;gap:6px;padding:3px 7px;border-radius:999px;font-size:11px;font-weight:800;${statusStyle}">
        ${unconnected ? "SIN CONECTAR" : "CONECTADA"}
      </div>`
    );

    lines.push(
      `<div style="margin-top:6px;font-size:12px">
        <b>Tipo</b>: ${escapeHtml(role.label)}
      </div>`
    );

    if (conn.connected) {
      lines.push(
        `<div style="margin-top:5px;font-size:11px;opacity:.78">
          Origen: <b>${escapeHtml(shortId(conn.from_node))}</b> ·
          Destino: <b>${escapeHtml(shortId(conn.to_node))}</b>
        </div>`
      );
    } else {
      lines.push(
        `<div style="margin-top:5px;color:#b45309;font-size:12px;font-weight:700">
          Falta origen o destino. No entra en simulación.
        </div>`
      );
    }

    lines.push(
      `<div style="margin-top:6px;font-size:12px">
        <b>Longitud</b>: ${fmt(lengthM, 1)} m ·
        <b>Ø</b>: ${diam == null ? "N/D" : `${fmt(diam, 0)} mm`}
      </div>`
    );

    if (ps) {
      const q = ps.q_lps ?? 0;
      const dh = ps.dH_m ?? null;

      lines.push(`<hr style="border:0;border-top:1px solid rgba(255,255,255,.18);margin:8px 0" />`);

      lines.push(
        `<div style="display:flex;gap:6px;flex-wrap:wrap">
          <span style="display:inline-flex;align-items:center;gap:6px;padding:3px 7px;border-radius:999px;font-size:11px;font-weight:900;background:${pressureBadgeColor};color:#08111f">
            ${pressureText}
          </span>
          <span style="display:inline-flex;align-items:center;gap:6px;padding:3px 7px;border-radius:999px;font-size:11px;font-weight:900;background:${kindColor};color:#08111f">
            ${kindLabel}
          </span>
        </div>`
      );

      if (pressure) {
        lines.push(
          `<div style="margin-top:6px;font-size:12px">
            <b>Presión tramo</b>: mín ${fmt(pressure.min_bar)} bar · prom ${fmt(pressure.avg_bar)} bar · máx ${fmt(pressure.max_bar)} bar
          </div>`
        );

        lines.push(
          `<div style="font-size:12px">
            <b>U</b>: cota ${fmt(pressure.u_elev_m, 0)} m · ${fmt(pressure.u_bar)} bar · ${escapeHtml(pressureKindLabel(pressure.pressure_kind_u))}
          </div>`
        );

        lines.push(
          `<div style="font-size:12px">
            <b>V</b>: cota ${fmt(pressure.v_elev_m, 0)} m · ${fmt(pressure.v_bar)} bar · ${escapeHtml(pressureKindLabel(pressure.pressure_kind_v))}
          </div>`
        );

        const srcU = pressure.origin_source_u?.label ?? pressure.origin_source_u?.source_type;
        const srcV = pressure.origin_source_v?.label ?? pressure.origin_source_v?.source_type;

        if (srcU || srcV) {
          lines.push(
            `<div style="margin-top:5px;font-size:11px;opacity:.72">
              Fuente U: ${escapeHtml(srcU ?? "—")}<br/>
              Fuente V: ${escapeHtml(srcV ?? "—")}
            </div>`
          );
        }
      }

      lines.push(
        `<div style="margin-top:6px">
          <b>Q visual</b>: ${fmt(q, 3)} L/s (${ps.dir === 1 ? "u→v" : "v→u"})
        </div>`
      );

      lines.push(`<div><b>ΔH</b>: ${dh == null ? "N/D" : fmt(dh, 2)} m</div>`);

      if (ps.blocked) {
        lines.push(`<div style="color:#991b1b;font-weight:800">BLOQUEADO</div>`);
      }
    } else if (sim && id) {
      lines.push(`<div style="opacity:.72;margin-top:5px">Sin datos de simulación para esta cañería</div>`);
    }

    const html = `<div style="min-width:300px;color:#fff">${lines.join("")}</div>`;

    try {
      (layer as any).bindTooltip(html, {
        sticky: true,
        direction: "top",
        opacity: 0.96,
      });
    } catch {}
  }

  return (
    <>
      <style>
        {`
          .pipe-flow-water {
            pointer-events: none;
            mix-blend-mode: normal;
          }
        `}
      </style>

      <GeoJSON
        key={`pipes-${selectedId ?? "none"}-${sim ? "sim" : "nosim"}-${
          showOnlySimulated ? "onlysim" : "all"
        }-${visibleData?.features?.length ?? 0}`}
        data={visibleData}
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
                const pressure = getPipePressureStats(sim, id);
                const role = inferPipeRole(feature);
                const diam = getDiameterMm(feature, sim);

                console.log("[PIPE CLICK]", {
                  id,
                  label,
                  conn,
                  pressure,
                  role,
                  diam,
                  geometryType: gtype,
                  layerType,
                  hasPm,
                });
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