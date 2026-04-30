import React from "react";
import L from "leaflet";
import { useMap, useMapEvents } from "react-leaflet";
import { barrios, edges, type Asset } from "../../data/demo";
import type { LatLng } from "../../lib/geo";

export function ZoomWatcher({ onZoom }: { onZoom: (z: number) => void }) {
  useMapEvents({
    zoomend: (e) => onZoom(e.target.getZoom()),
    moveend: (e) => onZoom(e.target.getZoom()),
  });

  return null;
}

export function MapClickClear({
  onClear,
  enabled = true,
}: {
  onClear: () => void;
  enabled?: boolean;
}) {
  useMapEvents({
    click: (e: any) => {
      if (!enabled) return;

      const t = e?.originalEvent?.target as any;
      if (!t) return;

      if (t.closest?.(".leaflet-popup")) return;

      if (
        t.closest?.(".leaflet-pm-draggable") ||
        t.closest?.(".leaflet-pm-marker") ||
        t.closest?.(".leaflet-pm-icon-marker") ||
        t.closest?.(".leaflet-pm-vertex") ||
        t.closest?.(".leaflet-pm-middle-marker") ||
        t.closest?.(".leaflet-pm-edit-marker")
      ) {
        return;
      }

      onClear();
    },
  });

  return null;
}

export function FitToRoute({
  dashedEdgeIdsExtra,
  assetsById,
  enabled,
}: {
  dashedEdgeIdsExtra?: Set<string>;
  assetsById: Map<string, Asset>;
  enabled: boolean;
}) {
  const map = useMap();

  React.useEffect(() => {
    if (!enabled) return;
    if (!dashedEdgeIdsExtra || dashedEdgeIdsExtra.size === 0) return;

    const pts: [number, number][] = [];

    for (const e of edges) {
      if (!dashedEdgeIdsExtra.has(e.id)) continue;

      if (Array.isArray((e as any).path) && (e as any).path.length) {
        for (const p of (e as any).path as [number, number][]) pts.push(p);
        continue;
      }

      const a = assetsById.get(e.from);
      const b = assetsById.get(e.to);

      if (a) pts.push([a.lat, a.lng]);
      if (b) pts.push([b.lat, b.lng]);
    }

    if (pts.length < 2) return;

    const bounds = L.latLngBounds(pts as any);
    map.fitBounds(bounds, {
      padding: [90, 90],
      maxZoom: 18,
    });
  }, [enabled, dashedEdgeIdsExtra, assetsById, map]);

  return null;
}

export function FitToBarrios({
  enabled,
  barrioIds,
  includePoint,
}: {
  enabled: boolean;
  barrioIds?: Set<string>;
  includePoint?: LatLng | null;
}) {
  const map = useMap();

  React.useEffect(() => {
    if (!enabled) return;
    if (!barrioIds || barrioIds.size === 0) return;

    const pts: [number, number][] = [];

    for (const b of barrios) {
      if (!barrioIds.has(b.id)) continue;
      for (const p of b.polygon) pts.push(p);
    }

    if (includePoint) pts.push(includePoint);
    if (pts.length < 2) return;

    const bounds = L.latLngBounds(pts as any);
    map.fitBounds(bounds, {
      padding: [110, 110],
      maxZoom: 18,
    });
  }, [enabled, barrioIds, includePoint, map]);

  return null;
}

export function PipeDrawController({
  enabled,
  onCreated,
}: {
  enabled: boolean;
  onCreated: (geom: any) => void;
}) {
  const map = useMap();

  React.useEffect(() => {
    const m: any = map as any;
    if (!m?.pm) return;

    const handleCreate = (e: any) => {
      try {
        const gj = e?.layer?.toGeoJSON?.();
        const geom = gj?.geometry;
        if (geom) onCreated(geom);
      } catch {}

      try {
        map.removeLayer(e.layer);
      } catch {}
    };

    map.on("pm:create", handleCreate);

    return () => {
      map.off("pm:create", handleCreate);
    };
  }, [map, onCreated]);

  React.useEffect(() => {
    const m: any = map as any;
    if (!m?.pm) return;

    if (enabled) {
      try {
        m.pm.enableDraw("Line", {
          snappable: true,
          snapDistance: 20,
          allowSelfIntersection: false,
        });
      } catch {}
    } else {
      try {
        m.pm.disableDraw("Line");
      } catch {}
    }
  }, [map, enabled]);

  return null;
}
