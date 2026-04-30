import React from "react";
import { CircleMarker, Tooltip } from "react-leaflet";
import { fetchNodes } from "../../services/mapasagua";
import type { SimRunResponse } from "./PipesLayer";

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

function fmt(n: number | null | undefined, digits = 2) {
  if (n == null) return "N/D";
  if (!isFinite(Number(n))) return "N/D";
  const x = Number(n);
  const a = Math.abs(x);
  if (a >= 100) return x.toFixed(0);
  if (a >= 10) return x.toFixed(1);
  return x.toFixed(digits);
}

export default function PressureNodesLayer({
  sim,
  visible = true,
  limit = 5000,
}: {
  sim: SimRunResponse | null;
  visible?: boolean;
  limit?: number;
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

        const mapped: NodeMapItem[] = (items ?? [])
          .map((x: any) => ({
            id: String(x?.id ?? ""),
            lat: Number(x?.lat),
            lng: Number(x?.lng),
            label: x?.label ?? x?.props?.label ?? null,
            kind: x?.kind ?? null,
            is_source: Boolean(x?.is_source),
            elev_m: x?.elev_m ?? null,
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
      return !!s?.reached;
    });
  }, [nodes, sim, visible]);

  if (!visible || !sim) return null;

  return (
    <>
      {reachedNodes.map((n) => {
        const s = sim.nodes?.[n.id];
        if (!s) return null;

        const bar = s.pressure_bar ?? null;
        const fillColor = pressureColor(bar);

        return (
          <CircleMarker
            key={n.id}
            center={[n.lat, n.lng]}
            radius={n.is_source ? 7 : 5}
            pathOptions={{
              color: "#ffffff",
              weight: 1.5,
              fillColor,
              fillOpacity: 0.92,
            }}
          >
            <Tooltip sticky direction="top" opacity={0.96}>
              <div style={{ minWidth: 220 }}>
                <div style={{ fontWeight: 800, marginBottom: 4 }}>
                  {n.label || s.label || "Nodo"}
                </div>

                <div style={{ fontSize: 12, opacity: 0.9, marginBottom: 6 }}>
                  {n.kind || s.kind || "JUNCTION"}
                </div>

                <div
                  style={{
                    display: "inline-block",
                    padding: "3px 8px",
                    borderRadius: 999,
                    background: fillColor,
                    color: "#08111f",
                    fontWeight: 800,
                    fontSize: 11,
                    marginBottom: 8,
                  }}
                >
                  {pressureLabel(bar)}
                </div>

                <div><b>Presión</b>: {fmt(s.pressure_bar)} bar</div>
                <div><b>Presión</b>: {fmt(s.pressure_mca)} mca</div>
                <div><b>Cota</b>: {fmt(s.elev_m ?? n.elev_m, 0)} m</div>
                <div><b>Head</b>: {fmt(s.head_m)} m</div>
                <div><b>Alcanzado</b>: {s.reached ? "Sí" : "No"}</div>
              </div>
            </Tooltip>
          </CircleMarker>
        );
      })}
    </>
  );
}