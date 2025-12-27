import React, { useEffect, useMemo, useState } from "react";
import "leaflet/dist/leaflet.css";

import { applyLeafletIconFix } from "./lib/leafletIconFix";
import { type LatLng } from "./lib/geo";
import { centroid } from "./lib/geoUtils";

import {
  assets as baseAssets,
  barrios,
  edges,
  zones,
  valveRouting,
  type Asset,
  type Edge,
  type Zone,
} from "./data/demo/index";


import { useToasts } from "./hooks/useToasts";
import { useSimulatedAssets } from "./hooks/useSimulatedAssets";
import { useInventory } from "./hooks/useInventory";

import { MapView, type FocusPair, type ViewMode } from "./components/MapView";
import { Sidebar, type SidebarMode, type ZoneTab } from "./components/Sidebar";

/** helpers */
function edgeRequiresOpen(e: Edge): string[] {
  const ro = (e.meta as any)?.requiresOpen;
  return Array.isArray(ro) ? ro.filter((x) => typeof x === "string") : [];
}

function valveImpactFromRouting(args: {
  valveId: string;
  selectedZoneId: string | null;
  locationPipes: Edge[];
  assetsById: Map<string, Asset>;
}) {
  const { valveId, selectedZoneId, locationPipes, assetsById } = args;

  const rt = valveRouting[valveId];
  const targets = rt?.targets ?? [];

  const barrioIds = targets
    .filter((t: any) => t.kind === "BARRIO")
    .map((t: any) => t.barrioId)
    .filter((x: any) => typeof x === "string");

  const locationIds = targets
    .filter((t: any) => t.kind === "LOCATION")
    .map((t: any) => t.locationId)
    .filter((x: any) => typeof x === "string");

  const hasBarrios = barrioIds.length > 0;

  const hasOtherLocationTarget =
    !!selectedZoneId && locationIds.some((locId) => locId && locId !== selectedZoneId);

  const pipes = (locationPipes ?? []).filter((e) => {
    if (e.from === valveId || e.to === valveId) return true;
    return edgeRequiresOpen(e).includes(valveId);
  });

  const crossesLocation = pipes.some((e) => {
    const a = assetsById.get(e.from);
    const b = assetsById.get(e.to);
    if (!a || !b) return false;
    return !!a.locationId && !!b.locationId && a.locationId !== b.locationId;
  });

  const hasPipesToOtherLocation = hasOtherLocationTarget || crossesLocation;

  const showImpact = hasBarrios || hasPipesToOtherLocation;

  return {
    showImpact,
    hasBarrios,
    hasPipesToOtherLocation,
    barrioIds,
    pipeIds: pipes.map((p) => p.id),
  };
}

export default function App() {
  useEffect(() => applyLeafletIconFix(), []);

  const [mode, setMode] = useState<SidebarMode>("NONE");
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [zoneTab, setZoneTab] = useState<ZoneTab>("VALVES");
  const [zoom, setZoom] = useState<number>(13.8);

  const { toasts, pushToast, clearToasts } = useToasts();

  const [valveEnabled, setValveEnabled] = useState<Record<string, boolean>>(() => {
    const m: Record<string, boolean> = {};
    for (const a of baseAssets) if (a.type === "VALVE") m[a.id] = true;
    return m;
  });

  const { assets, assetsById } = useSimulatedAssets(valveEnabled);

  const selectedZone = useMemo(
    () => zones.find((z) => z.id === selectedZoneId) ?? null,
    [selectedZoneId]
  );

  const selectedAsset = useMemo(
    () => (selectedAssetId ? assetsById.get(selectedAssetId) ?? null : null),
    [selectedAssetId, assetsById]
  );

  const locationInventory = useInventory({ selectedZoneId, assets, assetsById });

  const shrinkOthers = mode === "ZONE" && !!selectedZoneId;

  const [focusPair] = useState<FocusPair>(null);

  const [activeValveId, setActiveValveId] = useState<string | null>(null);

  // ✅ Vista/Filtro (Todos / Localidades / Cañerías / Barrios)
  const [viewMode, setViewMode] = useState<ViewMode>("ALL");
  const [viewSelectedId, setViewSelectedId] = useState<string | null>(null);

  const reset = () => {
    setMode("NONE");
    setSelectedZoneId(null);
    setSelectedAssetId(null);
    setActiveValveId(null);
    clearToasts();

    setViewMode("ALL");
    setViewSelectedId(null);
  };

  const selectZone = (z: Zone) => {
    setMode("ZONE");
    setSelectedZoneId(z.id);
    setSelectedAssetId(null);
    setZoneTab("VALVES");
    setActiveValveId(null);
    pushToast("Localidad", z.name);
  };

  const selectAsset = (id: string) => {
    setMode("ASSET");
    setSelectedAssetId(id);
    setSelectedZoneId(null);
    setActiveValveId(null);
  };

  const nextText = (id: string) => (valveEnabled[id] !== false ? "Cerrando" : "Abriendo");

  const toggleValve = (id: string) => {
    setValveEnabled((m) => {
      const next = !(m[id] !== false);
      return { ...m, [id]: next };
    });

    const v = assetsById.get(id);
    const name = v?.name ?? id;
    pushToast(nextText(id), name);

    if (mode === "ZONE") setActiveValveId(id);
  };

  const highlightedBarrioIds = useMemo(() => {
    const ids = new Set<string>();

    if (mode === "ZONE" && selectedZoneId) {
      for (const v of locationInventory.valves) {
        if (valveEnabled[v.id] === false) continue;
        const rt = valveRouting[v.id];
        for (const t of rt?.targets ?? []) if (t.kind === "BARRIO") ids.add(t.barrioId);
      }
      return ids;
    }

    if (mode === "ASSET" && selectedAsset?.type === "VALVE") {
      const rt = valveRouting[selectedAsset.id];
      for (const t of rt?.targets ?? []) if (t.kind === "BARRIO") ids.add(t.barrioId);
      return ids;
    }

    return ids;
  }, [mode, selectedZoneId, selectedAsset, locationInventory.valves, valveEnabled]);

  const highlightedEdgeIds = useMemo(() => {
    const ids = new Set<string>();
    if (mode === "ASSET" && selectedAsset?.type === "VALVE") {
      for (const e of edges) {
        if (e.from === selectedAsset.id || e.to === selectedAsset.id) ids.add(e.id);
        if (e.to === selectedAsset.id) ids.add(e.id);
      }
    }
    return ids;
  }, [mode, selectedAsset]);

  const valveImpact = useMemo(() => {
    if (!activeValveId) return null;
    return valveImpactFromRouting({
      valveId: activeValveId,
      selectedZoneId,
      locationPipes: locationInventory.pipes,
      assetsById,
    });
  }, [activeValveId, selectedZoneId, locationInventory.pipes, assetsById]);

  const highlightedBarrioIdsByValve = useMemo(() => {
    const ids = new Set<string>();
    if (!valveImpact?.showImpact) return ids;
    if (!valveImpact.hasBarrios) return ids;
    for (const id of valveImpact.barrioIds) ids.add(id);
    return ids;
  }, [valveImpact]);

  const dashedEdgeIdsByValve = useMemo(() => {
    const ids = new Set<string>();
    if (!valveImpact?.showImpact) return ids;
    if (!valveImpact.hasPipesToOtherLocation) return ids;
    for (const id of valveImpact.pipeIds) ids.add(id);
    return ids;
  }, [valveImpact]);

  const focusTarget = useMemo<LatLng | null>(() => {
    if (mode === "ASSET" && selectedAsset) return [selectedAsset.lat, selectedAsset.lng];

    if (mode === "ZONE" && selectedZoneId) {
      const locAssets = assets.filter((a) => a.locationId === selectedZoneId);
      if (locAssets.length) {
        const lat = locAssets.reduce((acc, a) => acc + a.lat, 0) / locAssets.length;
        const lng = locAssets.reduce((acc, a) => acc + a.lng, 0) / locAssets.length;
        return [lat, lng];
      }
      const z = zones.find((x) => x.id === selectedZoneId);
      if (z) return centroid(z.polygon);
    }

    return null;
  }, [mode, selectedAsset, selectedZoneId, assets]);

  /**
   * ✅ FIX: mapa gris
   * - Antes: solo se ponía gris si había selección o si viewMode != ALL
   * - Ahora: también se pone gris cuando los barrios están visibles (ALL incluye barrios, o BARRIOS)
   */
  const showBarrios = viewMode === "ALL" || viewMode === "BARRIOS";
  const mapGrey = mode !== "NONE" || viewMode !== "ALL" || showBarrios;

  // ✅ NUEVO: posición de la válvula activa (para encuadrar junto a barrios)
  const activeValvePos = useMemo<LatLng | null>(() => {
    if (!activeValveId) return null;
    const a = assetsById.get(activeValveId);
    if (!a) return null;
    return [a.lat, a.lng];
  }, [activeValveId, assetsById]);

  // ✅ NUEVO: forzar mostrar marcador de esa válvula aunque el zoom sea bajo
  const forceShowAssetIds = useMemo(() => {
    const s = new Set<string>();
    if (activeValveId) s.add(activeValveId);
    return s;
  }, [activeValveId]);

  // =========================
  // DEBUG LOGS (App)
  // =========================
  useEffect(() => {
    console.log("[DEBUG][App] mapGrey calc", {
      mode,
      viewMode,
      showBarrios,
      selectedZoneId,
      selectedAssetId,
      zoom,
      mapGrey,
    });
  }, [mode, viewMode, showBarrios, selectedZoneId, selectedAssetId, zoom, mapGrey]);

  useEffect(() => {
    console.log("[DEBUG][App] selection snapshot", {
      selectedZone: selectedZone?.id ?? null,
      selectedAsset: selectedAsset?.id ?? null,
      activeValveId,
      activeValvePos,
      viewSelectedId,
    });
  }, [selectedZone?.id, selectedAsset?.id, activeValveId, activeValvePos, viewSelectedId]);

  return (
    <div className="app">
      <Sidebar
        mode={mode}
        selectedZone={selectedZone}
        selectedAsset={selectedAsset}
        zoneTab={zoneTab}
        setZoneTab={setZoneTab}
        locationInventory={locationInventory}
        valveEnabled={valveEnabled}
        onToggleValve={toggleValve}
        onReset={reset}
        assetsById={assetsById}
        activeValveId={activeValveId}
        setActiveValveId={setActiveValveId}
        showValveImpact={!!valveImpact?.showImpact}
        // ✅ NUEVO
        viewMode={viewMode}
        setViewMode={setViewMode}
        viewSelectedId={viewSelectedId}
        setViewSelectedId={setViewSelectedId}
        zonesAll={zones}
        barriosAll={barrios}
        edgesAll={edges}
      />

      <div className="mapWrap">
        <div className="badgeOverlay">
          <div>
            <div className="badgeTitle">
              {mode === "ZONE" && selectedZone ? selectedZone.name : "Vista general"}
            </div>
            <div className="badgeSub">
              {viewMode === "ALL"
                ? "Mostrando todo"
                : viewMode === "ZONES"
                ? "Filtrado: Localidades"
                : viewMode === "PIPES"
                ? "Filtrado: Cañerías"
                : "Filtrado: Barrios"}
            </div>
          </div>
          <span className="pill">
            <span className="dot" style={{ background: "var(--zone)" }} /> Localidades
          </span>
        </div>

        <div className="toastWrap">
          {toasts.map((t) => (
            <div key={t.id} className="toast">
              <div className="toastTitle">{t.title}</div>
              <div className="toastSub">{t.sub}</div>
            </div>
          ))}
        </div>

        <MapView
          zoom={zoom}
          setZoom={setZoom}
          mode={mode}
          selectedZoneId={selectedZoneId}
          assets={assets}
          assetsById={assetsById}
          valveEnabled={valveEnabled}
          highlightedBarrioIds={highlightedBarrioIds}
          highlightedEdgeIds={highlightedEdgeIds}
          onSelectZone={selectZone}
          onSelectAsset={selectAsset}
          shrinkOthers={shrinkOthers}
          focusPair={focusPair}
          focusTarget={focusTarget}
          highlightedBarrioIdsExtra={highlightedBarrioIdsByValve}
          dashedEdgeIdsExtra={dashedEdgeIdsByValve}
          // ✅ NUEVO
          viewMode={viewMode}
          viewSelectedId={viewSelectedId}
          mapGrey={mapGrey}
          // ✅ NUEVO: encuadre + marker de válvula activa
          activeValvePos={activeValvePos}
          forceShowAssetIds={forceShowAssetIds}
        />
      </div>
    </div>
  );
}
