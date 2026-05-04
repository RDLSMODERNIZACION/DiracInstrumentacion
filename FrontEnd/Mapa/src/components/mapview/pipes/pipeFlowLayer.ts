import L from "leaflet";
import type { SimRunResponse } from "./types";
import { clamp, featureId, getConnHint } from "./pipeFeatureUtils";
import { inferPipeRole } from "./pipeRoleUtils";

export function weightFromAbsQ(absQ: number) {
  const w = 2 + Math.log10(1 + Math.max(0, absQ)) * 4;
  return clamp(w, 2, 10);
}

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

export function createFlowLayer(args: {
  map: L.Map;
  visibleData: any;
  sim: SimRunResponse;
  mapZoom: number;
}) {
  const { map, visibleData, sim, mapZoom } = args;

  if (!sim?.pipes) return null;
  if (!visibleData?.features || !Array.isArray(visibleData.features)) return null;
  if (mapZoom < 15.7) return null;

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

  if (!flowItems.length) return null;

  const grp = L.layerGroup();
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

  return {
    layer: grp,
    destroy: () => {
      window.cancelAnimationFrame(raf);
      window.clearInterval(timer);
      grp.remove();
    },
  };
}