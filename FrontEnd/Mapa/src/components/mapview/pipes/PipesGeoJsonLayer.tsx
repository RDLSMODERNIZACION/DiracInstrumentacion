// src/components/mapview/pipes/PipesGeoJsonLayer.tsx

import React from "react";
import { GeoJSON, useMap } from "react-leaflet";
import L from "leaflet";

import { fetchPipesBBox, fetchPipesAll } from "../../../services/mapasagua";

import type { PipeLayerProps } from "./types";

import {
  computeConnectivityStats,
  featureId,
  getConnHint,
  pickLabel,
} from "./pipeFeatureUtils";

import {
  getPipePressureStats,
  pressureColor,
} from "./pipePressureUtils";

import {
  diameterWeight,
  getDiameterMm,
  inferPipeRole,
} from "./pipeRoleUtils";

import {
  createFlowLayer,
  weightFromAbsQ,
} from "./pipeFlowLayer";

import { bindPipeTooltip } from "./pipeTooltip";

export default function PipesGeoJsonLayer({
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
}: PipeLayerProps) {
  const map = useMap();

  const [data, setData] = React.useState<any>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [mapZoom, setMapZoom] = React.useState(() => map.getZoom());

  const freezeRef = React.useRef<boolean>(freeze);
  const flowLayerRef = React.useRef<{ destroy: () => void } | null>(null);

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
    let t: ReturnType<typeof setTimeout> | null = null;

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

      /*
        Importante:
        - Si una cañería queda bloqueada por válvula, queremos verla.
        - Si filtramos todos los blocked, la válvula parecería desaparecer.
      */
      if (sp.blocked && !sp.valve_closed) return false;

      return true;
    });

    return {
      ...data,
      features: simulatedFeatures,
    };
  }, [data, sim, showOnlySimulated]);

  React.useEffect(() => {
    if (!visibleData) return;

    const n = Array.isArray(visibleData?.features)
      ? visibleData.features.length
      : 0;

    onCount?.(n);
    onConnectivityStats?.(computeConnectivityStats(visibleData));
  }, [visibleData, onCount, onConnectivityStats]);

  React.useEffect(() => {
    if (flowLayerRef.current) {
      flowLayerRef.current.destroy();
      flowLayerRef.current = null;
    }

    if (!showArrows) return;
    if (!visible) return;
    if (!sim?.pipes) return;
    if (!visibleData?.features || !Array.isArray(visibleData.features)) return;

    const flowLayer = createFlowLayer({
      map,
      visibleData,
      sim,
      mapZoom,
    });

    flowLayerRef.current = flowLayer;

    return () => {
      if (flowLayerRef.current) {
        flowLayerRef.current.destroy();
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

    const isSel =
      selectedId != null &&
      id != null &&
      String(id) === String(selectedId);

    const conn = getConnHint(feature);
    const unconnected = !conn.connected;

    const role = inferPipeRole(feature);
    const diam = getDiameterMm(feature, sim);

    let color = s.color ?? role.color;
    let weight = diameterWeight(diam);
    let opacity = s.opacity ?? 0.9;
    let dashArray: string | undefined = role.dashArray;

    if (!sim && highlightUnconnected && unconnected) {
      color = "#f59e0b";
      weight = Math.max(weight, 5);
      opacity = 0.98;
      dashArray = "8 7";
    }

    if (simStyle && id && sim?.pipes && sim.pipes[id]) {
      const ps = sim.pipes[id];

      const absQ =
        typeof ps.abs_q_lps === "number"
          ? ps.abs_q_lps
          : Math.abs(ps.q_lps ?? 0);

      const pressure = getPipePressureStats(sim, id);
      const pressureForColor = pressure?.min_bar ?? pressure?.avg_bar ?? null;

      const warnings = pressure?.warnings ?? ps.warnings ?? [];
      const sourceMix = pressure?.source_mix ?? ps.source_mix ?? null;

      const hasMixedTankPressure = sourceMix === "MIXED_TANK_PRESSURE";
      const hasPressureWarning =
        warnings.includes("DISTRIBUTION_FED_BY_PRESSURE") ||
        warnings.includes("TANK_ZONE_INVADED_BY_PRESSURE") ||
        warnings.includes("TANK_AND_PRESSURE_REACH_NODE") ||
        warnings.includes("TANK_AND_REAL_PRESSURE_REACH_NODE");

      weight = Math.max(weight, weightFromAbsQ(absQ));
      dashArray = undefined;

      if (ps.valve_closed) {
        color = "#ef4444";
        opacity = 1;
        weight = Math.max(weight + 2, 7);
        dashArray = "3 8";
      } else if (ps.blocked) {
        color = "#ef4444";
        opacity = 0.82;
        dashArray = "3 8";
      } else if (colorByPressure) {
        color = pressureColor(pressureForColor);
        opacity = hasPressureWarning ? 1 : 0.92;

        if (hasMixedTankPressure || hasPressureWarning) {
          weight = Math.max(weight + 1.4, 6);
          dashArray = "2 7";
        }
      } else if (absQ >= 0.001) {
        color = "#22c55e";
        opacity = 0.88;
      } else {
        color = "#94a3b8";
        opacity = 0.35;
      }
    }

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

  return (
    <>
      <style>
        {`
          .pipe-flow-water {
            pointer-events: none;
            mix-blend-mode: normal;
          }

          .leaflet-tooltip.pipeTooltipDark {
            background: transparent;
            border: 0;
            box-shadow: none;
            padding: 0;
          }

          .leaflet-tooltip.pipeTooltipDark::before {
            display: none;
          }

          .pipeTooltipCard {
            min-width: 240px;
            max-width: 340px;
            background: rgba(15, 23, 42, 0.96);
            color: #fff;
            border: 1px solid rgba(255,255,255,0.14);
            border-radius: 14px;
            padding: 10px 11px;
            box-shadow: 0 16px 34px rgba(0,0,0,0.35);
            backdrop-filter: blur(8px);
            font-size: 12px;
            line-height: 1.35;
          }

          .pipeTooltipCard__title {
            font-weight: 950;
            font-size: 13px;
            margin-bottom: 2px;
          }

          .pipeTooltipCard__id {
            opacity: 0.55;
            font-size: 10px;
            margin-bottom: 6px;
          }

          .pipeTooltipCard__badges {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
            margin: 6px 0;
          }

          .pipeTooltipCard__badges span {
            display: inline-flex;
            align-items: center;
            padding: 3px 7px;
            border-radius: 999px;
            font-size: 10px;
            font-weight: 900;
          }

          .pipeTooltipCard__badges .ok {
            background: #16a34a;
            color: #fff;
          }

          .pipeTooltipCard__badges .warn {
            background: #f59e0b;
            color: #111827;
          }

          .pipeTooltipCard__row {
            margin-top: 4px;
            font-size: 12px;
          }

          .pipeTooltipCard__muted {
            margin-top: 5px;
            font-size: 11px;
            opacity: 0.72;
          }

          .pipeTooltipCard__mutedSmall {
            margin-top: 3px;
            font-size: 10px;
            opacity: 0.65;
          }

          .pipeTooltipCard__warning {
            margin-top: 7px;
            padding: 7px 8px;
            border-radius: 10px;
            background: rgba(249,115,22,0.16);
            border: 1px solid rgba(249,115,22,0.34);
            color: #fff;
            font-size: 11px;
            font-weight: 700;
          }

          .pipeTooltipCard__sourceBox {
            margin-top: 7px;
            padding: 7px 8px;
            border-radius: 10px;
            background: rgba(59,130,246,0.14);
            border: 1px solid rgba(59,130,246,0.28);
            color: #fff;
            font-size: 11px;
          }

          .pipeTooltipCard__alsoBox {
            margin-top: 7px;
            padding: 7px 8px;
            border-radius: 10px;
            background: rgba(255,255,255,0.07);
            border: 1px solid rgba(255,255,255,0.12);
            color: #fff;
            font-size: 11px;
          }
        `}
      </style>

      <GeoJSON
        key={`pipes-${selectedId ?? "none"}-${sim ? "sim" : "nosim"}-${
          showOnlySimulated ? "onlysim" : "all"
        }-${visibleData?.features?.length ?? 0}-${
          sim?.meta?.n_sources ?? "nosources"
        }-${sim?.meta?.n_pipes_used ?? "nopipes"}`}
        data={visibleData}
        style={styleFn ?? defaultStyle}
        onEachFeature={(feature, layer) => {
          const id = featureId(feature);
          const label = pickLabel(feature);

          bindPipeTooltip(layer, feature, sim);

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
                  latlng: e?.latlng,
                });
              } catch {}
            }

            if (!id) return;

            onSelect?.(id, layer, label, feature, e?.latlng);
          });
        }}
      />
    </>
  );
}