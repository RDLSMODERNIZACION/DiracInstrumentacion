import React from "react";
import L from "leaflet";
import { Marker, Tooltip } from "react-leaflet";
import {
  fetchDiameterTransitions,
  type DiameterTransition,
} from "../../services/mapasagua";

function severityColor(sev?: string | null) {
  if (sev === "CRITICAL") return "#ef4444";
  if (sev === "HIGH") return "#f97316";
  if (sev === "MEDIUM") return "#facc15";
  return "#38bdf8";
}

function severityLabel(sev?: string | null) {
  if (sev === "CRITICAL") return "CRÍTICA";
  if (sev === "HIGH") return "ALTA";
  if (sev === "MEDIUM") return "MEDIA";
  return "BAJA";
}

function fmt(n: number | null | undefined, digits = 1) {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  return Number(n).toFixed(digits);
}

function buildTransitionIcon(x: DiameterTransition) {
  const color = severityColor(x.severity);
  const badge =
    x.severity === "CRITICAL"
      ? "!"
      : x.severity === "HIGH"
        ? "▲"
        : x.severity === "MEDIUM"
          ? "•"
          : "Ø";

  return L.divIcon({
    className: "map-diameter-transition-marker",
    html: `
      <div style="position:relative;width:42px;height:42px;display:grid;place-items:center;">
        <div
          style="
            position:absolute;
            inset:7px;
            border-radius:999px;
            background:${color};
            opacity:.16;
            transform:scale(1.25);
            filter:blur(1px);
          "
        ></div>

        <div
          style="
            width:28px;
            height:28px;
            border-radius:999px;
            background:rgba(255,255,255,.96);
            border:4px solid ${color};
            box-shadow:
              0 0 0 4px rgba(255,255,255,.70),
              0 10px 24px rgba(0,0,0,.25);
          "
        ></div>

        <div
          style="
            position:absolute;
            inset:0;
            display:grid;
            place-items:center;
            color:#0f172a;
            font-size:14px;
            font-weight:950;
            line-height:1;
          "
        >Ø</div>

        <div
          style="
            position:absolute;
            top:1px;
            right:1px;
            min-width:14px;
            height:14px;
            padding:0 4px;
            border-radius:999px;
            background:${color};
            color:#0f172a;
            border:2px solid white;
            display:grid;
            place-items:center;
            font-size:10px;
            font-weight:950;
            box-shadow:0 4px 10px rgba(0,0,0,.16);
          "
        >${badge}</div>
      </div>
    `,
    iconSize: [42, 42],
    iconAnchor: [21, 21],
    tooltipAnchor: [0, -18],
  });
}

export default function DiameterTransitionsLayer({
  visible,
  minDeltaMm = 20,
  minRatio = 1.1,
}: {
  visible: boolean;
  minDeltaMm?: number;
  minRatio?: number;
}) {
  const [items, setItems] = React.useState<DiameterTransition[]>([]);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!visible) return;

    let cancelled = false;

    async function load() {
      setBusy(true);

      try {
        const rows = await fetchDiameterTransitions({
          min_delta_mm: minDeltaMm,
          min_ratio: minRatio,
          limit: 5000,
        });

        if (!cancelled) setItems(rows);
      } catch (e) {
        console.warn("No se pudieron cargar transiciones de diámetro", e);
        if (!cancelled) setItems([]);
      } finally {
        if (!cancelled) setBusy(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [visible, minDeltaMm, minRatio]);

  if (!visible) return null;

  return (
    <>
      {items.map((x) => {
        const color = severityColor(x.severity);

        return (
          <Marker
            key={x.node_id}
            position={[Number(x.lat), Number(x.lng)]}
            icon={buildTransitionIcon(x)}
            zIndexOffset={1400}
            riseOnHover
          >
            <Tooltip sticky direction="top" opacity={0.98}>
              <div style={{ minWidth: 260 }}>
                <div style={{ fontWeight: 900, fontSize: 14 }}>
                  Cambio de diámetro
                </div>

                <div style={{ fontSize: 12, opacity: 0.82, marginTop: 2 }}>
                  Nodo {x.node_label || x.node_id.slice(0, 8)}
                </div>

                <div
                  style={{
                    display: "inline-block",
                    marginTop: 8,
                    padding: "3px 8px",
                    borderRadius: 999,
                    background: color,
                    color: "#111827",
                    fontWeight: 900,
                    fontSize: 11,
                  }}
                >
                  {severityLabel(x.severity)}
                </div>

                <div style={{ marginTop: 8 }}>
                  <b>Máx</b>: Ø {fmt(x.max_diam_mm, 0)} mm
                </div>
                <div>
                  <b>Mín</b>: Ø {fmt(x.min_diam_mm, 0)} mm
                </div>
                <div>
                  <b>Diferencia</b>: {fmt(x.delta_diam_mm, 0)} mm
                </div>
                <div>
                  <b>Relación</b>: {fmt(x.ratio_diam, 2)}x
                </div>
                <div>
                  <b>Cota</b>: {fmt(x.elev_m, 0)} m
                </div>

                <hr
                  style={{
                    border: 0,
                    borderTop: "1px solid rgba(0,0,0,.15)",
                    margin: "8px 0",
                  }}
                />

                <div style={{ fontWeight: 900, marginBottom: 4 }}>
                  Cañerías conectadas
                </div>

                <div style={{ display: "grid", gap: 4 }}>
                  {(x.pipes || []).slice(0, 8).map((p) => (
                    <div key={p.pipe_id} style={{ fontSize: 12 }}>
                      • Ø {fmt(p.diam_mm, 0)} mm ·{" "}
                      {p.layer_name || p.pipe_id.slice(0, 8)}
                    </div>
                  ))}
                </div>

                {busy && (
                  <div style={{ marginTop: 8, fontSize: 11, opacity: 0.6 }}>
                    Actualizando...
                  </div>
                )}
              </div>
            </Tooltip>
          </Marker>
        );
      })}
    </>
  );
}