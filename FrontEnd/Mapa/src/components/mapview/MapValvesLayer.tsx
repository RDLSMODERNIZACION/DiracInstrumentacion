import React from "react";
import { CircleMarker, Popup } from "react-leaflet";
import {
  fetchMapValves,
  updateMapValveState,
  deleteMapValve,
  type MapValveLive,
} from "../../services/mapasagua";

function valveColor(v: MapValveLive) {
  return v.is_open ? "#22c55e" : "#ef4444";
}

function valveLabel(v: MapValveLive) {
  return v.is_open ? "ABIERTA" : "CERRADA";
}

function fmt(n: number | null | undefined, digits = 0) {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  return Number(n).toFixed(digits);
}

export default function MapValvesLayer({
  visible,
  reloadKey = 0,
  onChanged,
}: {
  visible: boolean;
  reloadKey?: number;
  onChanged?: () => void;
}) {
  const [items, setItems] = React.useState<MapValveLive[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [updatingId, setUpdatingId] = React.useState<string | null>(null);

  async function load() {
    setBusy(true);
    setErr(null);

    try {
      const rows = await fetchMapValves();
      setItems(rows.filter((v) => v.lat != null && v.lng != null));
    } catch (e: any) {
      setErr(e?.message ?? "No se pudieron cargar válvulas");
      setItems([]);
    } finally {
      setBusy(false);
    }
  }

  React.useEffect(() => {
    if (!visible) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, reloadKey]);

  async function toggleValve(v: MapValveLive) {
    setUpdatingId(v.valve_id);

    try {
      const updated = await updateMapValveState(v.valve_id, !v.is_open);

      setItems((prev) =>
        prev.map((x) => (x.valve_id === updated.valve_id ? updated : x))
      );

      onChanged?.();
    } catch (e: any) {
      alert(e?.message ?? "No se pudo cambiar el estado de la válvula");
    } finally {
      setUpdatingId(null);
    }
  }

  async function removeValve(v: MapValveLive) {
    const ok = confirm(`¿Borrar válvula "${v.name}"?`);
    if (!ok) return;

    setUpdatingId(v.valve_id);

    try {
      await deleteMapValve(v.valve_id);
      setItems((prev) => prev.filter((x) => x.valve_id !== v.valve_id));
      onChanged?.();
    } catch (e: any) {
      alert(e?.message ?? "No se pudo borrar la válvula");
    } finally {
      setUpdatingId(null);
    }
  }

  if (!visible) return null;

  return (
    <>
      {items.map((v) => {
        const color = valveColor(v);
        const isBusy = updatingId === v.valve_id;

        return (
          <CircleMarker
            key={v.valve_id}
            center={[Number(v.lat), Number(v.lng)]}
            radius={v.is_open ? 7 : 9}
            pathOptions={{
              color: "#111827",
              weight: 2.5,
              fillColor: color,
              fillOpacity: 0.96,
              opacity: 1,
            }}
          >
            <Popup>
              <div style={{ minWidth: 230 }}>
                <div style={{ fontWeight: 900, fontSize: 15 }}>
                  {v.name}
                </div>

                <div style={{ marginTop: 4, fontSize: 12, opacity: 0.75 }}>
                  {v.map_pipe_id ? "Válvula sobre cañería" : "Válvula sobre nodo"}
                </div>

                <div
                  style={{
                    display: "inline-block",
                    marginTop: 8,
                    padding: "4px 9px",
                    borderRadius: 999,
                    background: color,
                    color: "#111827",
                    fontWeight: 900,
                    fontSize: 11,
                  }}
                >
                  {valveLabel(v)}
                </div>

                <div style={{ marginTop: 10, fontSize: 13 }}>
                  {v.pipe_name && (
                    <div>
                      <b>Cañería</b>: {v.pipe_name}
                    </div>
                  )}

                  {v.diametro_mm != null && (
                    <div>
                      <b>Ø</b>: {fmt(v.diametro_mm)} mm
                    </div>
                  )}

                  {v.flow_func && (
                    <div>
                      <b>Función</b>: {v.flow_func}
                    </div>
                  )}

                  {v.node_elev_m != null && (
                    <div>
                      <b>Cota</b>: {fmt(v.node_elev_m)} m
                    </div>
                  )}

                  {v.notes && (
                    <div style={{ marginTop: 6, opacity: 0.8 }}>
                      {v.notes}
                    </div>
                  )}
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 12 }}>
                  <button
                    onClick={() => toggleValve(v)}
                    disabled={isBusy}
                    style={{
                      padding: "9px 10px",
                      borderRadius: 10,
                      border: "1px solid rgba(0,0,0,0.15)",
                      background: v.is_open ? "#ef4444" : "#22c55e",
                      color: "#fff",
                      fontWeight: 900,
                      cursor: isBusy ? "default" : "pointer",
                      opacity: isBusy ? 0.6 : 1,
                    }}
                  >
                    {isBusy ? "..." : v.is_open ? "Cerrar" : "Abrir"}
                  </button>

                  <button
                    onClick={() => removeValve(v)}
                    disabled={isBusy}
                    style={{
                      padding: "9px 10px",
                      borderRadius: 10,
                      border: "1px solid rgba(0,0,0,0.15)",
                      background: "#111827",
                      color: "#fff",
                      fontWeight: 900,
                      cursor: isBusy ? "default" : "pointer",
                      opacity: isBusy ? 0.6 : 1,
                    }}
                  >
                    Borrar
                  </button>
                </div>
              </div>
            </Popup>
          </CircleMarker>
        );
      })}

      {err && (
        <CircleMarker center={[-37.4, -68.93]} radius={0}>
          <Popup>{err}</Popup>
        </CircleMarker>
      )}
    </>
  );
}