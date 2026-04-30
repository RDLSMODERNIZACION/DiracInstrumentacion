import React from "react";
import { connectPipe, createNode } from "../../services/mapasagua";

type NodeLite = {
  id: string;
  kind?: string;
  label?: string;
  lat?: number;
  lng?: number;
};

type LatLngSimple = {
  lat: number;
  lng: number;
};

type SuggestedNode = {
  node: NodeLite;
  distance_m: number;
};

function normalizeId(v?: string | null) {
  const s = String(v ?? "").trim();
  if (!s || ["null", "undefined", "none", "nan"].includes(s.toLowerCase())) return "";
  return s;
}

function fmtMeters(v: number | null | undefined) {
  if (v == null || !isFinite(Number(v))) return "N/D";
  const n = Number(v);
  if (n >= 100) return `${n.toFixed(0)} m`;
  if (n >= 10) return `${n.toFixed(1)} m`;
  return `${n.toFixed(2)} m`;
}

function nodeText(n: NodeLite) {
  const label = n.label?.trim();
  const kind = n.kind?.trim() || "JUNCTION";
  const idShort = n.id.length > 12 ? `${n.id.slice(0, 8)}…` : n.id;

  const coord =
    n.lat != null && n.lng != null && isFinite(n.lat) && isFinite(n.lng)
      ? ` · ${n.lat.toFixed(5)}, ${n.lng.toFixed(5)}`
      : "";

  return `${label ? `${label} · ` : ""}${kind} · ${idShort}${coord}`;
}

function distanceM(a: LatLngSimple, b: LatLngSimple) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;

  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * R * Math.asin(Math.sqrt(h));
}

function isFinitePoint(p: any): p is LatLngSimple {
  return (
    p &&
    typeof p.lat === "number" &&
    typeof p.lng === "number" &&
    isFinite(p.lat) &&
    isFinite(p.lng)
  );
}

function getPipeEndpoints(feature: any): { from: LatLngSimple; to: LatLngSimple } | null {
  const geom = feature?.geometry;
  if (!geom) return null;

  let first: any[] | null = null;
  let last: any[] | null = null;

  if (geom.type === "LineString") {
    const coords = geom.coordinates ?? [];
    if (coords.length < 2) return null;

    first = coords[0];
    last = coords[coords.length - 1];
  }

  if (geom.type === "MultiLineString") {
    const lines = geom.coordinates ?? [];
    if (!lines.length) return null;

    const firstLine = lines[0] ?? [];
    const lastLine = lines[lines.length - 1] ?? [];

    if (!firstLine.length || !lastLine.length) return null;

    first = firstLine[0];
    last = lastLine[lastLine.length - 1];
  }

  if (!first || !last) return null;

  const from = {
    lng: Number(first[0]),
    lat: Number(first[1]),
  };

  const to = {
    lng: Number(last[0]),
    lat: Number(last[1]),
  };

  if (!isFinitePoint(from) || !isFinitePoint(to)) return null;

  return { from, to };
}

function nearestNode(nodes: NodeLite[], point: LatLngSimple, excludeId?: string): SuggestedNode | null {
  let best: SuggestedNode | null = null;

  for (const n of nodes) {
    if (!n.id) continue;
    if (excludeId && n.id === excludeId) continue;
    if (n.lat == null || n.lng == null) continue;
    if (!isFinite(n.lat) || !isFinite(n.lng)) continue;

    const d = distanceM(point, { lat: n.lat, lng: n.lng });

    if (!best || d < best.distance_m) {
      best = { node: n, distance_m: d };
    }
  }

  return best;
}

function nearestNodes(nodes: NodeLite[], point: LatLngSimple, maxItems = 80) {
  return nodes
    .filter((n) => n.lat != null && n.lng != null && isFinite(n.lat) && isFinite(n.lng))
    .map((n) => ({
      ...n,
      _distance_m: distanceM(point, { lat: Number(n.lat), lng: Number(n.lng) }),
    }))
    .sort((a, b) => a._distance_m - b._distance_m)
    .slice(0, maxItems);
}

function endpointDistanceLabel(endpoints: { from: LatLngSimple; to: LatLngSimple } | null) {
  if (!endpoints) return null;
  const d = distanceM(endpoints.from, endpoints.to);
  return fmtMeters(d);
}

async function createEndpointNode({
  point,
  pipeId,
  endpoint,
}: {
  point: LatLngSimple;
  pipeId: string;
  endpoint: "from" | "to";
}) {
  const label = endpoint === "from" ? "Nodo manual inicio" : "Nodo manual fin";

  const created = await createNode({
    lat: point.lat,
    lng: point.lng,
    kind: "JUNCTION",
    label,
    props: {
      label,
      manual_created_from_front: true,
      pipe_id: pipeId,
      endpoint,
    },
  } as any);

  return created;
}

export default function PipeConnectDrawer({
  open,
  onClose,
  pipeId,
  pipeFeature,
  nodes,
  initialFrom,
  initialTo,
  onConnected,
}: {
  open: boolean;
  onClose: () => void;
  pipeId: string | null;
  pipeFeature?: any;
  nodes: NodeLite[];
  initialFrom?: string | null;
  initialTo?: string | null;
  onConnected?: (from: string, to: string) => void;
}) {
  const [fromNode, setFromNode] = React.useState<string>("");
  const [toNode, setToNode] = React.useState<string>("");
  const [search, setSearch] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [snapToleranceM, setSnapToleranceM] = React.useState<number>(5);

  const endpoints = React.useMemo(() => getPipeEndpoints(pipeFeature), [pipeFeature]);

  const sorted = React.useMemo(() => {
    const seen = new Set<string>();

    const arr = (Array.isArray(nodes) ? nodes : [])
      .map((n) => ({
        id: normalizeId(n.id),
        kind: n.kind,
        label: n.label,
        lat: n.lat != null ? Number(n.lat) : undefined,
        lng: n.lng != null ? Number(n.lng) : undefined,
      }))
      .filter((n) => {
        if (!n.id || seen.has(n.id)) return false;
        seen.add(n.id);
        return true;
      });

    arr.sort((a, b) => nodeText(a).localeCompare(nodeText(b)));
    return arr;
  }, [nodes]);

  const nodeById = React.useMemo(() => {
    const m = new Map<string, NodeLite>();
    for (const n of sorted) m.set(n.id, n);
    return m;
  }, [sorted]);

  const suggestion = React.useMemo(() => {
    if (!endpoints || !sorted.length) return null;

    const from = nearestNode(sorted, endpoints.from);
    const to = nearestNode(sorted, endpoints.to, from?.node.id);

    if (!from || !to) return null;

    return { from, to };
  }, [endpoints, sorted]);

  const closeNodesForFrom = React.useMemo(() => {
    if (!endpoints) return [];
    return nearestNodes(sorted, endpoints.from, 80);
  }, [sorted, endpoints]);

  const closeNodesForTo = React.useMemo(() => {
    if (!endpoints) return [];
    return nearestNodes(sorted, endpoints.to, 80);
  }, [sorted, endpoints]);

  const listForSelects = React.useMemo(() => {
    const q = search.trim().toLowerCase();

    let arr: NodeLite[] = [];

    if (q) {
      arr = sorted.filter((n) => {
        if (n.id === fromNode || n.id === toNode) return true;

        return `${n.id} ${n.kind ?? ""} ${n.label ?? ""} ${n.lat ?? ""} ${n.lng ?? ""}`
          .toLowerCase()
          .includes(q);
      });
    } else if (endpoints) {
      const m = new Map<string, NodeLite>();

      for (const n of closeNodesForFrom) m.set(n.id, n);
      for (const n of closeNodesForTo) m.set(n.id, n);

      if (fromNode && nodeById.has(fromNode)) m.set(fromNode, nodeById.get(fromNode)!);
      if (toNode && nodeById.has(toNode)) m.set(toNode, nodeById.get(toNode)!);

      arr = Array.from(m.values());
    } else {
      arr = sorted.slice(0, 200);
    }

    for (const selectedId of [fromNode, toNode]) {
      if (selectedId && !arr.find((n) => n.id === selectedId)) {
        arr.unshift(
          nodeById.get(selectedId) ?? {
            id: selectedId,
            kind: "ACTUAL",
            label: "Nodo actual no listado",
          }
        );
      }
    }

    return arr;
  }, [
    sorted,
    search,
    endpoints,
    closeNodesForFrom,
    closeNodesForTo,
    fromNode,
    toNode,
    nodeById,
  ]);

  React.useEffect(() => {
    if (!open) return;

    const initialFromId = normalizeId(initialFrom);
    const initialToId = normalizeId(initialTo);

    setFromNode(initialFromId);
    setToNode(initialToId);
    setSearch("");
    setErr(null);
  }, [open, pipeId, initialFrom, initialTo]);

  React.useEffect(() => {
    if (!open) return;

    const hasInitial = normalizeId(initialFrom) || normalizeId(initialTo);
    if (hasInitial) return;

    if (!suggestion) return;

    if (suggestion.from.node.id && suggestion.to.node.id && suggestion.from.node.id !== suggestion.to.node.id) {
      setFromNode(suggestion.from.node.id);
      setToNode(suggestion.to.node.id);
    }
  }, [open, initialFrom, initialTo, suggestion]);

  const currentConnected = Boolean(fromNode && toNode && fromNode !== toNode);
  const noNodes = sorted.length === 0;

  const fromDistance =
    endpoints && fromNode && nodeById.get(fromNode)?.lat != null && nodeById.get(fromNode)?.lng != null
      ? distanceM(endpoints.from, {
          lat: Number(nodeById.get(fromNode)?.lat),
          lng: Number(nodeById.get(fromNode)?.lng),
        })
      : null;

  const toDistance =
    endpoints && toNode && nodeById.get(toNode)?.lat != null && nodeById.get(toNode)?.lng != null
      ? distanceM(endpoints.to, {
          lat: Number(nodeById.get(toNode)?.lat),
          lng: Number(nodeById.get(toNode)?.lng),
        })
      : null;

  function useSuggestion() {
    if (!suggestion) return;

    setFromNode(suggestion.from.node.id);
    setToNode(suggestion.to.node.id);
    setErr(null);
  }

  async function saveSelectedNodes() {
    if (!pipeId) return;

    const from = normalizeId(fromNode);
    const to = normalizeId(toNode);

    if (!from || !to) {
      setErr("Elegí nodo origen y nodo destino.");
      return;
    }

    if (from === to) {
      setErr("Origen y destino no pueden ser el mismo nodo.");
      return;
    }

    setBusy(true);
    setErr(null);

    try {
      await connectPipe(pipeId, from, to);
      onConnected?.(from, to);
      onClose();
    } catch (e: any) {
      setErr(String(e?.body || e?.message || "Error conectando la cañería."));
    } finally {
      setBusy(false);
    }
  }

  async function smartCreateAndConnect() {
    if (!pipeId) return;

    if (!endpoints) {
      setErr("No se pudieron leer los extremos de la geometría de la cañería.");
      return;
    }

    const pipeEndpointDistance = distanceM(endpoints.from, endpoints.to);

    if (pipeEndpointDistance < 0.05) {
      setErr("La cañería tiene inicio y fin prácticamente en el mismo punto. Revisá la geometría.");
      return;
    }

    setBusy(true);
    setErr(null);

    try {
      let fromId = "";
      let toId = "";

      const nearestFrom = nearestNode(sorted, endpoints.from);
      const nearestTo = nearestNode(sorted, endpoints.to, nearestFrom?.node.id);

      if (nearestFrom && nearestFrom.distance_m <= snapToleranceM) {
        fromId = nearestFrom.node.id;
      } else {
        const created = await createEndpointNode({
          point: endpoints.from,
          pipeId,
          endpoint: "from",
        });

        fromId = String(created?.id ?? "");
      }

      if (nearestTo && nearestTo.distance_m <= snapToleranceM && nearestTo.node.id !== fromId) {
        toId = nearestTo.node.id;
      } else {
        const created = await createEndpointNode({
          point: endpoints.to,
          pipeId,
          endpoint: "to",
        });

        toId = String(created?.id ?? "");
      }

      if (!fromId || !toId) {
        throw new Error("No se pudieron crear o seleccionar los nodos de conexión.");
      }

      if (fromId === toId) {
        throw new Error("El origen y destino quedaron iguales. Bajá la tolerancia o creá nodos manualmente.");
      }

      await connectPipe(pipeId, fromId, toId);

      onConnected?.(fromId, toId);
      onClose();
    } catch (e: any) {
      setErr(String(e?.body || e?.message || "No se pudo crear/conectar en extremos."));
    } finally {
      setBusy(false);
    }
  }

  if (!open || !pipeId) return null;

  return (
    <div className="pipeConnectDrawer" role="dialog" aria-modal="true">
      <div className="pipeConnectDrawer__header">
        <div>
          <div className="pipeConnectDrawer__title">Conectar cañería</div>
          <div className="pipeConnectDrawer__pipeId">{pipeId}</div>
        </div>

        <button className="pipeConnectDrawer__close" onClick={onClose} type="button">
          Cerrar
        </button>
      </div>

      <div className="pipeConnectDrawer__body">
        <div
          className={
            currentConnected
              ? "pipeConnectDrawer__state pipeConnectDrawer__state--ok"
              : "pipeConnectDrawer__state pipeConnectDrawer__state--warn"
          }
        >
          <span className="pipeConnectDrawer__stateDot" />

          <div>
            <b>{currentConnected ? "Conectada" : "Sin conectar"}</b>
            <div>
              {currentConnected
                ? "Esta cañería tiene nodo origen y destino."
                : "Falta definir origen y destino."}
            </div>
          </div>
        </div>

        {endpoints && (
          <div className="pipeConnectDrawer__tip">
            <b>Extremos de la cañería</b>
            <div style={{ marginTop: 6 }}>
              Inicio: {endpoints.from.lat.toFixed(6)}, {endpoints.from.lng.toFixed(6)}
            </div>
            <div>
              Fin: {endpoints.to.lat.toFixed(6)}, {endpoints.to.lng.toFixed(6)}
            </div>
            <div>Longitud visual extremo-extremo: {endpointDistanceLabel(endpoints)}</div>
          </div>
        )}

        {suggestion && (
          <div className="pipeConnectDrawer__tip">
            <b>Sugerencia por cercanía</b>

            <div style={{ marginTop: 6 }}>
              Origen: {nodeText(suggestion.from.node)}
              <br />
              Distancia al inicio: <b>{fmtMeters(suggestion.from.distance_m)}</b>
            </div>

            <div style={{ marginTop: 6 }}>
              Destino: {nodeText(suggestion.to.node)}
              <br />
              Distancia al fin: <b>{fmtMeters(suggestion.to.distance_m)}</b>
            </div>

            <button
              className="pipeConnectDrawer__miniBtn"
              type="button"
              onClick={useSuggestion}
              disabled={busy}
              style={{ marginTop: 8 }}
            >
              Usar nodos sugeridos
            </button>
          </div>
        )}

        <div className="pipeConnectDrawer__tip">
          <b>Conexión rápida recomendada</b>
          <div style={{ marginTop: 6 }}>
            Usa un nodo existente si está cerca del extremo. Si no, crea un nodo nuevo en el extremo de la cañería.
          </div>

          <label className="pipeConnectDrawer__field" style={{ marginTop: 10 }}>
            <span>Tolerancia para usar nodo existente</span>
            <input
              className="pipeConnectDrawer__input"
              type="number"
              min={0.5}
              max={50}
              step={0.5}
              value={snapToleranceM}
              onChange={(e) => setSnapToleranceM(Number(e.target.value))}
              disabled={busy}
            />
          </label>

          <button
            className="pipeConnectDrawer__save"
            type="button"
            onClick={smartCreateAndConnect}
            disabled={busy || !endpoints}
            style={{ marginTop: 10 }}
          >
            {busy ? "Conectando..." : "Crear nodos en extremos y conectar"}
          </button>
        </div>

        <label className="pipeConnectDrawer__field">
          <span>Buscar nodo</span>
          <input
            className="pipeConnectDrawer__input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Nombre, tipo, coordenada o ID..."
          />
        </label>

        <label className="pipeConnectDrawer__field">
          <span>Nodo origen</span>
          <select
            className="pipeConnectDrawer__select"
            value={fromNode}
            onChange={(e) => setFromNode(e.target.value)}
            disabled={busy}
          >
            <option value="">— elegir origen —</option>

            {listForSelects.map((n) => (
              <option key={`from-${n.id}`} value={n.id}>
                {nodeText(n)}
              </option>
            ))}
          </select>

          {fromDistance != null && (
            <small style={{ color: "#64748b", fontWeight: 700 }}>
              Distancia al inicio: {fmtMeters(fromDistance)}
            </small>
          )}
        </label>

        <label className="pipeConnectDrawer__field">
          <span>Nodo destino</span>
          <select
            className="pipeConnectDrawer__select"
            value={toNode}
            onChange={(e) => setToNode(e.target.value)}
            disabled={busy}
          >
            <option value="">— elegir destino —</option>

            {listForSelects.map((n) => (
              <option key={`to-${n.id}`} value={n.id}>
                {nodeText(n)}
              </option>
            ))}
          </select>

          {toDistance != null && (
            <small style={{ color: "#64748b", fontWeight: 700 }}>
              Distancia al fin: {fmtMeters(toDistance)}
            </small>
          )}
        </label>

        <div className="pipeConnectDrawer__tools">
          <button
            className="pipeConnectDrawer__miniBtn"
            type="button"
            disabled={busy || !fromNode || !toNode}
            onClick={() => {
              setFromNode(toNode);
              setToNode(fromNode);
            }}
          >
            Invertir sentido
          </button>

          <button
            className="pipeConnectDrawer__miniBtn"
            type="button"
            disabled={busy || (!fromNode && !toNode)}
            onClick={() => {
              setFromNode("");
              setToNode("");
            }}
          >
            Limpiar
          </button>
        </div>

        {noNodes && (
          <div className="pipeConnectDrawer__warnBox">
            No llegaron nodos desde el backend. Revisá <b>/mapa/nodes</b>.
          </div>
        )}

        {err && <div className="pipeConnectDrawer__error">{err}</div>}

        <button
          className="pipeConnectDrawer__save"
          onClick={saveSelectedNodes}
          disabled={busy || !fromNode || !toNode || fromNode === toNode}
          type="button"
        >
          {busy ? "Guardando conexión..." : "Guardar conexión seleccionada"}
        </button>

        <div className="pipeConnectDrawer__tip">
          Para conectar manualmente, apagá la simulación. Con SIM ON solo se muestran las cañerías simuladas.
        </div>
      </div>
    </div>
  );
}