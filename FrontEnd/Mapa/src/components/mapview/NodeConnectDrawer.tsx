import React from "react";
import { connectPipe, createPipe } from "../../services/mapasagua";

type NodeLite = {
  id: string;
  kind?: string;
  label?: string;
  lat?: number;
  lng?: number;
};

type PickMode = "from" | "to";

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
  const idShort = n.id.length > 14 ? `${n.id.slice(0, 8)}…${n.id.slice(-4)}` : n.id;

  const coord =
    n.lat != null && n.lng != null && isFinite(n.lat) && isFinite(n.lng)
      ? ` · ${n.lat.toFixed(5)}, ${n.lng.toFixed(5)}`
      : "";

  return `${label ? `${label} · ` : ""}${kind} · ${idShort}${coord}`;
}

function distanceM(a: NodeLite, b: NodeLite) {
  if (a.lat == null || a.lng == null || b.lat == null || b.lng == null) return null;
  if (!isFinite(a.lat) || !isFinite(a.lng) || !isFinite(b.lat) || !isFinite(b.lng)) return null;

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

function getCreatedPipeId(created: any): string {
  return normalizeId(
    created?.id ??
      created?.pipe_id ??
      created?.pipe?.id ??
      created?.pipe?.pipe_id ??
      created?.feature?.id ??
      created?.feature?.properties?.id ??
      created?.properties?.id
  );
}

export default function NodeConnectDrawer({
  open,
  onClose,
  nodes,
  nodesBusy,
  ensureNodes,
  fromNodeId,
  toNodeId,
  pickMode,
  setFromNodeId,
  setToNodeId,
  setPickMode,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  nodes: NodeLite[];
  nodesBusy: boolean;
  ensureNodes: () => Promise<void> | void;
  fromNodeId: string;
  toNodeId: string;
  pickMode: PickMode;
  setFromNodeId: (id: string) => void;
  setToNodeId: (id: string) => void;
  setPickMode: (mode: PickMode) => void;
  onCreated?: () => void;
}) {
  const [search, setSearch] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setSearch("");
    setErr(null);
    ensureNodes();
  }, [open]);

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

  const fromNode = nodeById.get(normalizeId(fromNodeId));
  const toNode = nodeById.get(normalizeId(toNodeId));
  const dist = fromNode && toNode ? distanceM(fromNode, toNode) : null;

  const listForSelects = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    const selected = new Set([normalizeId(fromNodeId), normalizeId(toNodeId)].filter(Boolean));

    let arr = q
      ? sorted.filter((n) =>
          `${n.id} ${n.kind ?? ""} ${n.label ?? ""} ${n.lat ?? ""} ${n.lng ?? ""}`
            .toLowerCase()
            .includes(q)
        )
      : sorted.slice(0, 250);

    for (const id of selected) {
      if (id && !arr.some((n) => n.id === id)) {
        arr = [
          nodeById.get(id) ?? {
            id,
            kind: "ACTUAL",
            label: "Nodo seleccionado no listado",
          },
          ...arr,
        ];
      }
    }

    return arr;
  }, [search, sorted, fromNodeId, toNodeId, nodeById]);

  function setFrom(id: string) {
    setFromNodeId(normalizeId(id));
    setErr(null);
    if (id && !toNodeId) setPickMode("to");
  }

  function setTo(id: string) {
    setToNodeId(normalizeId(id));
    setErr(null);
  }

  function validateNodes() {
    const fromId = normalizeId(fromNodeId);
    const toId = normalizeId(toNodeId);

    if (!fromId || !toId) throw new Error("Elegí un nodo origen y un nodo destino.");
    if (fromId === toId) throw new Error("El nodo origen y destino no pueden ser el mismo.");

    const from = nodeById.get(fromId);
    const to = nodeById.get(toId);

    if (!from) throw new Error(`No encontré el nodo origen ${fromId} en /mapa/nodes.`);
    if (!to) throw new Error(`No encontré el nodo destino ${toId} en /mapa/nodes.`);

    if (from.lat == null || from.lng == null || !isFinite(from.lat) || !isFinite(from.lng)) {
      throw new Error(`El nodo origen ${fromId} no tiene coordenadas válidas.`);
    }

    if (to.lat == null || to.lng == null || !isFinite(to.lat) || !isFinite(to.lng)) {
      throw new Error(`El nodo destino ${toId} no tiene coordenadas válidas.`);
    }

    return { fromId, toId, from, to };
  }

  async function saveConnection() {
    setBusy(true);
    setErr(null);

    try {
      const { fromId, toId, from, to } = validateNodes();

      const created = await createPipe({
        geometry: {
          type: "LineString",
          coordinates: [
            [Number(from.lng), Number(from.lat)],
            [Number(to.lng), Number(to.lat)],
          ],
        },
        properties: {
          from_node: fromId,
          to_node: toId,
          type: "WATER",
          estado: "OK",
          flow_func: "DISTRIBUCION",
          diametro_mm: null,
          material: null,
          props: {
            Layer: "Conexión manual de nodos",
            label: "Conexión manual de nodos",
            from_node: fromId,
            to_node: toId,
            manual_node_connection: true,
          },
          style: {},
        } as any,
      });

      const newPipeId = getCreatedPipeId(created);
      if (newPipeId) {
        await connectPipe(newPipeId, fromId, toId).catch(() => null);
      }

      onCreated?.();
      onClose();
    } catch (e: any) {
      setErr(String(e?.body || e?.message || "No se pudo crear la conexión entre nodos."));
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <div className="pipeConnectDrawer" role="dialog" aria-modal="true">
      <div className="pipeConnectDrawer__header">
        <div>
          <div className="pipeConnectDrawer__title">Conectar nodos</div>
          <div className="pipeConnectDrawer__pipeId">Seleccioná origen y destino; se crea una cañería entre ambos.</div>
        </div>

        <button className="pipeConnectDrawer__close" onClick={onClose} type="button">
          Cerrar
        </button>
      </div>

      <div className="pipeConnectDrawer__body">
        <div className="pipeConnectDrawer__tip">
          <b>Modo de selección en el mapa</b>
          <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <button
              className="pipeConnectDrawer__miniBtn"
              type="button"
              onClick={() => setPickMode("from")}
              style={pickMode === "from" ? { background: "#2563eb", color: "#fff" } : undefined}
            >
              1) Elegir origen
            </button>
            <button
              className="pipeConnectDrawer__miniBtn"
              type="button"
              onClick={() => setPickMode("to")}
              style={pickMode === "to" ? { background: "#2563eb", color: "#fff" } : undefined}
            >
              2) Elegir destino
            </button>
          </div>
          <div style={{ marginTop: 8, fontSize: 12 }}>
            También podés pegar el ID completo en el buscador y elegirlo en los selectores.
          </div>
        </div>

        <label className="pipeConnectDrawer__field">
          <span>Buscar nodo por ID, nombre o coordenada</span>
          <input
            className="pipeConnectDrawer__input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Ej: 99f9d853-d43d-41b0-bd95-60ae7f5c35dc"
            disabled={busy}
          />
        </label>

        <label className="pipeConnectDrawer__field">
          <span>ID origen directo</span>
          <input
            className="pipeConnectDrawer__input"
            value={normalizeId(fromNodeId)}
            onChange={(e) => setFrom(e.target.value)}
            placeholder="ID del primer nodo"
            disabled={busy || nodesBusy}
          />
        </label>

        <label className="pipeConnectDrawer__field">
          <span>ID destino directo</span>
          <input
            className="pipeConnectDrawer__input"
            value={normalizeId(toNodeId)}
            onChange={(e) => setTo(e.target.value)}
            placeholder="ID del segundo nodo"
            disabled={busy || nodesBusy}
          />
        </label>

        <label className="pipeConnectDrawer__field">
          <span>Nodo origen</span>
          <select
            className="pipeConnectDrawer__select"
            value={normalizeId(fromNodeId)}
            onChange={(e) => setFrom(e.target.value)}
            disabled={busy || nodesBusy}
          >
            <option value="">— elegir origen —</option>
            {listForSelects.map((n) => (
              <option key={`from-${n.id}`} value={n.id}>
                {nodeText(n)}
              </option>
            ))}
          </select>
          {fromNode && (
            <small style={{ color: "#64748b", fontWeight: 700 }}>
              {fromNode.id}
            </small>
          )}
        </label>

        <label className="pipeConnectDrawer__field">
          <span>Nodo destino</span>
          <select
            className="pipeConnectDrawer__select"
            value={normalizeId(toNodeId)}
            onChange={(e) => setTo(e.target.value)}
            disabled={busy || nodesBusy}
          >
            <option value="">— elegir destino —</option>
            {listForSelects.map((n) => (
              <option key={`to-${n.id}`} value={n.id}>
                {nodeText(n)}
              </option>
            ))}
          </select>
          {toNode && (
            <small style={{ color: "#64748b", fontWeight: 700 }}>
              {toNode.id}
            </small>
          )}
        </label>

        <div className="pipeConnectDrawer__tools">
          <button
            className="pipeConnectDrawer__miniBtn"
            type="button"
            disabled={busy || !fromNodeId || !toNodeId}
            onClick={() => {
              const a = fromNodeId;
              setFromNodeId(toNodeId);
              setToNodeId(a);
            }}
          >
            Invertir
          </button>

          <button
            className="pipeConnectDrawer__miniBtn"
            type="button"
            disabled={busy || (!fromNodeId && !toNodeId)}
            onClick={() => {
              setFromNodeId("");
              setToNodeId("");
              setPickMode("from");
              setErr(null);
            }}
          >
            Limpiar
          </button>

          <button
            className="pipeConnectDrawer__miniBtn"
            type="button"
            disabled={busy || nodesBusy}
            onClick={() => ensureNodes()}
          >
            {nodesBusy ? "Cargando..." : "Recargar nodos"}
          </button>
        </div>

        <div className={fromNode && toNode && fromNode.id !== toNode.id ? "pipeConnectDrawer__state pipeConnectDrawer__state--ok" : "pipeConnectDrawer__state pipeConnectDrawer__state--warn"}>
          <span className="pipeConnectDrawer__stateDot" />
          <div>
            <b>{fromNode && toNode && fromNode.id !== toNode.id ? "Lista para crear" : "Falta seleccionar origen/destino"}</b>
            <div>
              {fromNode && toNode && fromNode.id !== toNode.id
                ? `Distancia aproximada entre nodos: ${fmtMeters(dist)}`
                : "Tocá dos nodos en el mapa o elegilos desde los selectores."}
            </div>
          </div>
        </div>

        {sorted.length === 0 && !nodesBusy && (
          <div className="pipeConnectDrawer__warnBox">
            No llegaron nodos desde el backend. Revisá <b>/mapa/nodes</b>.
          </div>
        )}

        {err && <div className="pipeConnectDrawer__error">{err}</div>}

        <button
          className="pipeConnectDrawer__save"
          type="button"
          onClick={saveConnection}
          disabled={busy || nodesBusy || !fromNodeId || !toNodeId || fromNodeId === toNodeId}
        >
          {busy ? "Creando conexión..." : "Crear cañería entre estos nodos"}
        </button>
      </div>
    </div>
  );
}
