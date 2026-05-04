import React from "react";
import { CircleMarker, Tooltip } from "react-leaflet";
import { fetchNodes } from "../../services/mapasagua";
import type { SimRunResponse } from "./PipesLayer";

type PressureKind = "REAL" | "TANK" | "MANUAL" | "CALC" | string;

type NodeMapItem = {
  id: string;
  lat: number;
  lng: number;
  label?: string | null;
  kind?: string | null;
  is_source?: boolean;
  elev_m?: number | null;
  props?: any;
};

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
  if (bar == null || !isFinite(Number(bar))) return "N/D";

  const p = Number(bar);

  if (p < 0.5) return "Muy baja";
  if (p < 1.2) return "Baja";
  if (p < 2.0) return "Aceptable baja";
  if (p <= 5.0) return "Normal";
  if (p <= 6.5) return "Alta";
  return "Sobrepresión";
}

function pressureKindLabel(kind: PressureKind | null | undefined) {
  if (kind === "REAL") return "REAL";
  if (kind === "TANK") return "TANQUE";
  if (kind === "MANUAL") return "MANUAL";
  if (kind === "CALC") return "TEÓRICO";
  return "N/D";
}

function pressureKindColor(kind: PressureKind | null | undefined) {
  if (kind === "REAL") return "#8b5cf6";
  if (kind === "TANK") return "#06b6d4";
  if (kind === "MANUAL") return "#eab308";
  if (kind === "CALC") return "#64748b";
  return "#94a3b8";
}

function pressureKindBorder(kind: PressureKind | null | undefined) {
  if (kind === "REAL") return "#ffffff";
  if (kind === "TANK") return "#e0f2fe";
  if (kind === "MANUAL") return "#fef3c7";
  if (kind === "CALC") return "rgba(255,255,255,0.82)";
  return "rgba(255,255,255,0.7)";
}

function pressureKindRadius(kind: PressureKind | null | undefined, isSource?: boolean) {
  if (kind === "REAL") return 8;
  if (kind === "TANK") return 8;
  if (kind === "MANUAL") return 8;
  if (isSource) return 7;
  return 5;
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

function safeNumber(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;

  if (typeof v === "string") {
    const cleaned = v.trim().replace(",", ".");
    if (!cleaned) return null;

    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }

  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function getSourceName(source: any) {
  return (
    source?.label ??
    source?.source_name ??
    source?.asset_name ??
    source?.asset_id ??
    source?.source_type ??
    null
  );
}

function getNodeTitle(n: NodeMapItem, s: any) {
  return n.label || s?.label || getSourceName(s?.source) || getSourceName(s?.origin_source) || "Nodo";
}

function getKindDescription(kind: PressureKind | null | undefined) {
  if (kind === "REAL") return "Punto con presión real medida por manómetro/manifold.";
  if (kind === "TANK") return "Punto de carga hidráulica por tanque, nivel y cota.";
  if (kind === "MANUAL") return "Fuente manual fija de simulación.";
  if (kind === "CALC") return "Presión teórica calculada por propagación.";
  return "Sin clasificación.";
}

export default function PressureNodesLayer({
  sim,
  visible = true,
  limit = 10000,
  onlyImportant = false,
}: {
  sim: SimRunResponse | null;
  visible?: boolean;
  limit?: number;
  /**
   * Si true, muestra solamente fuentes reales/tanques/manuales.
   * Por defecto false para mostrar también calculados.
   */
  onlyImportant?: boolean;
}) {
  const [nodes, setNodes] = React.useState<NodeMapItem[]>([]);
  const [loaded, setLoaded] = React.useState(false);

  React.useEffect(() => {
    if (!visible) return;
    if (!sim) return;
    if (loaded) return;

    let cancelled = false;

    (async () => {
      try {
        const items = await fetchNodes(limit);
        if (cancelled) return;

        const mapped: NodeMapItem[] = (Array.isArray(items) ? items : [])
          .map((x: any) => ({
            id: String(x?.id ?? ""),
            lat: Number(x?.lat),
            lng: Number(x?.lng),
            label: x?.label ?? x?.props?.label ?? null,
            kind: x?.kind ?? null,
            is_source: Boolean(x?.is_source),
            elev_m: safeNumber(x?.elev_m),
            props: x?.props ?? {},
          }))
          .filter((x: NodeMapItem) => !!x.id && isFinite(x.lat) && isFinite(x.lng));

        setNodes(mapped);
        setLoaded(true);
      } catch (err) {
        console.warn("No se pudieron cargar nodos para PressureNodesLayer", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [visible, sim, loaded, limit]);

  const reachedNodes = React.useMemo(() => {
    if (!visible || !sim?.nodes) return [];

    return nodes.filter((n) => {
      const s = sim.nodes?.[n.id];
      if (!s?.reached) return false;

      if (!onlyImportant) return true;

      const kind = s.pressure_kind;
      return kind === "REAL" || kind === "TANK" || kind === "MANUAL";
    });
  }, [nodes, sim, visible, onlyImportant]);

  if (!visible || !sim) return null;

  return (
    <>
      {reachedNodes.map((n) => {
        const s = sim.nodes?.[n.id];
        if (!s) return null;

        const bar = s.pressure_bar ?? null;
        const pressureFill = pressureColor(bar);

        const pressureKind: PressureKind | null =
          s.pressure_kind ??
          s.source?.pressure_kind ??
          s.origin_source?.pressure_kind ??
          null;

        const kindColor = pressureKindColor(pressureKind);
        const borderColor = pressureKindBorder(pressureKind);
        const radius = pressureKindRadius(pressureKind, s.is_source || n.is_source);

        const source = s.source ?? null;
        const origin = s.origin_source ?? null;

        const sourceName = getSourceName(source);
        const originName = getSourceName(origin);

        const isDirectSource = Boolean(s.is_source);
        const title = getNodeTitle(n, s);

        return (
          <CircleMarker
            key={n.id}
            center={[n.lat, n.lng]}
            radius={radius}
            pathOptions={{
              color: borderColor,
              weight: pressureKind === "REAL" || pressureKind === "TANK" || pressureKind === "MANUAL" ? 2.8 : 1.4,
              fillColor: isDirectSource ? kindColor : pressureFill,
              fillOpacity: isDirectSource ? 0.96 : 0.86,
              opacity: 0.98,
            }}
          >
            <Tooltip sticky direction="top" opacity={0.97}>
              <div style={{ minWidth: 250 }}>
                <div style={{ fontWeight: 900, marginBottom: 4 }}>
                  {title}
                </div>

                <div style={{ fontSize: 12, opacity: 0.9, marginBottom: 8 }}>
                  {n.kind || s.kind || "JUNCTION"}
                </div>

                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                  <span
                    style={{
                      display: "inline-block",
                      padding: "3px 8px",
                      borderRadius: 999,
                      background: pressureFill,
                      color: "#08111f",
                      fontWeight: 900,
                      fontSize: 11,
                    }}
                  >
                    {pressureLabel(bar)}
                  </span>

                  <span
                    style={{
                      display: "inline-block",
                      padding: "3px 8px",
                      borderRadius: 999,
                      background: kindColor,
                      color: "#08111f",
                      fontWeight: 900,
                      fontSize: 11,
                    }}
                  >
                    {pressureKindLabel(pressureKind)}
                  </span>
                </div>

                <div style={{ fontSize: 12, marginBottom: 6, opacity: 0.9 }}>
                  {getKindDescription(pressureKind)}
                </div>

                <div><b>Presión</b>: {fmt(s.pressure_bar)} bar</div>
                <div><b>Presión</b>: {fmt(s.pressure_mca)} mca</div>
                <div><b>Cota</b>: {fmt(s.elev_m ?? n.elev_m, 0)} m</div>
                <div><b>Head</b>: {fmt(s.head_m)} m</div>
                <div><b>Alcanzado</b>: {s.reached ? "Sí" : "No"}</div>

                {source && (
                  <>
                    <hr style={{ border: 0, borderTop: "1px solid rgba(255,255,255,.18)", margin: "8px 0" }} />

                    <div style={{ fontWeight: 900, fontSize: 12, marginBottom: 4 }}>
                      Fuente directa
                    </div>

                    <div><b>Tipo</b>: {source.source_type ?? "—"}</div>
                    <div><b>Nombre</b>: {sourceName ?? "—"}</div>

                    {source.asset_type && (
                      <div>
                        <b>Activo</b>: {source.asset_type} {source.asset_id ?? ""}
                      </div>
                    )}

                    {source.pressure_bar_real != null && (
                      <div><b>Presión real</b>: {fmt(source.pressure_bar_real)} bar</div>
                    )}

                    {source.level_pct != null && (
                      <div><b>Nivel tanque</b>: {fmt(source.level_pct, 1)} %</div>
                    )}

                    {source.water_height_m != null && (
                      <div><b>Altura agua</b>: {fmt(source.water_height_m, 2)} m</div>
                    )}

                    {source.live_status && (
                      <div><b>Estado dato</b>: {source.live_status}</div>
                    )}
                  </>
                )}

                {!source && origin && (
                  <>
                    <hr style={{ border: 0, borderTop: "1px solid rgba(255,255,255,.18)", margin: "8px 0" }} />

                    <div style={{ fontWeight: 900, fontSize: 12, marginBottom: 4 }}>
                      Calculado desde
                    </div>

                    <div><b>Origen</b>: {originName ?? "—"}</div>
                    <div><b>Tipo</b>: {origin.source_type ?? "—"}</div>

                    {origin.asset_type && (
                      <div>
                        <b>Activo</b>: {origin.asset_type} {origin.asset_id ?? ""}
                      </div>
                    )}
                  </>
                )}
              </div>
            </Tooltip>
          </CircleMarker>
        );
      })}
    </>
  );
}