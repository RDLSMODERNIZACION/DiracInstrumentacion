import React from "react";
import type { CSSProperties } from "react";
import type { MapAssetLive } from "../../services/mapasagua";

type AssetLinkMode = "none" | "node" | "pipe";
type AssetTypeFilter = "ALL" | "TANK" | "MANIFOLD" | "PUMP";
type MapFilter = "ALL" | "LINKED" | "UNLINKED";
type LiveFilter = "ALL" | "ONLINE" | "STALE" | "NO_DATA";

function assetTypeLabel(type?: string | null) {
  if (type === "TANK") return "Tanque";
  if (type === "MANIFOLD") return "Presión";
  if (type === "PUMP") return "Bomba";
  return type || "Activo";
}

function liveStatusLabel(v?: string | null) {
  if (v === "ONLINE") return "ONLINE";
  if (v === "STALE") return "VIEJO";
  if (v === "NO_DATA") return "SIN DATO";
  return "—";
}

function liveStatusColor(v?: string | null) {
  if (v === "ONLINE") return "#22c55e";
  if (v === "STALE") return "#f59e0b";
  if (v === "NO_DATA") return "#94a3b8";
  return "#64748b";
}

function fmt(v: number | null | undefined, digits = 2) {
  if (v == null || !Number.isFinite(Number(v))) return "—";
  return Number(v).toFixed(digits);
}

function metricText(a: MapAssetLive) {
  if (a.asset_type === "TANK") {
    return `Nivel ${fmt(a.level_pct, 1)} %`;
  }

  if (a.asset_type === "MANIFOLD") {
    const p = `P ${fmt(a.pressure_bar, 2)} bar`;
    const q = a.flow_lps == null ? "" : ` · Q ${fmt(a.flow_lps, 2)} l/s`;
    return `${p}${q}`;
  }

  if (a.asset_type === "PUMP") {
    return `Estado ${a.run_status || "—"}`;
  }

  return a.sim_role || "—";
}

function assetDisplayName(a: MapAssetLive) {
  return a.asset_name || `${a.asset_type} ${a.asset_id}`;
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div
      style={{
        borderRadius: 14,
        padding: "10px 12px",
        background: "rgba(255,255,255,0.055)",
        border: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      <div
        style={{
          fontSize: 12,
          color: "rgba(255,255,255,0.68)",
          lineHeight: 1,
        }}
      >
        {label}
      </div>

      <div
        style={{
          marginTop: 6,
          fontWeight: 950,
          fontSize: 18,
          lineHeight: 1,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 11,
        fontWeight: 950,
        letterSpacing: 0.6,
        textTransform: "uppercase",
        color: "rgba(255,255,255,0.7)",
        marginBottom: 8,
      }}
    >
      {children}
    </div>
  );
}

function quickBtn(active: boolean): CSSProperties {
  return {
    padding: "8px 10px",
    borderRadius: 11,
    border: "1px solid rgba(255,255,255,0.12)",
    background: active ? "rgba(34,211,238,0.14)" : "rgba(255,255,255,0.045)",
    color: "#fff",
    fontWeight: 900,
    fontSize: 12,
    cursor: "pointer",
  };
}

function primaryBtn(disabled = false): CSSProperties {
  return {
    width: "100%",
    padding: "11px 12px",
    borderRadius: 13,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.055)",
    color: "#fff",
    fontWeight: 900,
    fontSize: 13,
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.6 : 1,
  };
}

function actionBtn(active = false, color = "rgba(34,197,94,0.92)", disabled = false): CSSProperties {
  return {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.14)",
    background: active ? color : "rgba(255,255,255,0.05)",
    color: "#fff",
    fontWeight: 900,
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.58 : 1,
  };
}

const inputStyle: CSSProperties = {
  width: "100%",
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(15,23,42,0.88)",
  color: "#fff",
  padding: "10px 12px",
  fontSize: 13,
  outline: "none",
};

const selectStyle: CSSProperties = {
  width: "100%",
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(15,23,42,0.88)",
  color: "#fff",
  padding: "10px 12px",
  fontSize: 13,
  outline: "none",
};

export default function MapAssetsPanel({
  open,
  assets,
  busy,
  error,
  selectedAsset,
  linkMode,
  onClose,
  onRefresh,
  onSelectAsset,
  onStartLinkNode,
  onStartLinkPipe,
  onCancelLink,
  onUnlink,
}: {
  open: boolean;
  assets: MapAssetLive[];
  busy: boolean;
  error: string | null;
  selectedAsset: MapAssetLive | null;
  linkMode: AssetLinkMode;
  onClose: () => void;
  onRefresh: () => void;
  onSelectAsset: (asset: MapAssetLive) => void;
  onStartLinkNode: () => void;
  onStartLinkPipe: () => void;
  onCancelLink: () => void;
  onUnlink: () => void;
}) {
  const safeAssets = React.useMemo(() => (Array.isArray(assets) ? assets : []), [assets]);

  const [search, setSearch] = React.useState("");
  const [typeFilter, setTypeFilter] = React.useState<AssetTypeFilter>("ALL");
  const [locationFilter, setLocationFilter] = React.useState<string>("ALL");
  const [mapFilter, setMapFilter] = React.useState<MapFilter>("ALL");
  const [liveFilter, setLiveFilter] = React.useState<LiveFilter>("ALL");

  React.useEffect(() => {
    if (!open) {
      setSearch("");
      setTypeFilter("ALL");
      setLocationFilter("ALL");
      setMapFilter("ALL");
      setLiveFilter("ALL");
    }
  }, [open]);

  const counters = React.useMemo(() => {
    return {
      total: safeAssets.length,
      online: safeAssets.filter((a) => a.live_status === "ONLINE").length,
      linked: safeAssets.filter((a) => a.linked_to_map).length,
      tanks: safeAssets.filter((a) => a.asset_type === "TANK").length,
      manifolds: safeAssets.filter((a) => a.asset_type === "MANIFOLD").length,
      pumps: safeAssets.filter((a) => a.asset_type === "PUMP").length,
    };
  }, [safeAssets]);

  const locations = React.useMemo(() => {
    const set = new Set<number>();

    for (const a of safeAssets) {
      if (a.location_id != null) {
        set.add(Number(a.location_id));
      }
    }

    return Array.from(set).sort((a, b) => a - b);
  }, [safeAssets]);

  const filteredAssets = React.useMemo(() => {
    const q = search.trim().toLowerCase();

    return safeAssets.filter((a) => {
      if (typeFilter !== "ALL" && a.asset_type !== typeFilter) return false;
      if (locationFilter !== "ALL" && String(a.location_id ?? "") !== locationFilter) return false;
      if (mapFilter === "LINKED" && !a.linked_to_map) return false;
      if (mapFilter === "UNLINKED" && a.linked_to_map) return false;
      if (liveFilter !== "ALL" && a.live_status !== liveFilter) return false;

      if (q) {
        const haystack = [
          assetDisplayName(a),
          a.asset_type,
          String(a.asset_id ?? ""),
          String(a.location_id ?? ""),
          a.live_status ?? "",
          a.run_status ?? "",
        ]
          .join(" ")
          .toLowerCase();

        if (!haystack.includes(q)) return false;
      }

      return true;
    });
  }, [safeAssets, search, typeFilter, locationFilter, mapFilter, liveFilter]);

  if (!open) return null;

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        right: 0,
        height: "100%",
        width: "min(460px, 92vw)",
        zIndex: 1200,
        pointerEvents: "none",
      }}
    >
      <aside
        style={{
          pointerEvents: "auto",
          position: "absolute",
          top: 0,
          right: 0,
          height: "100%",
          width: "100%",
          padding: 14,
          display: "flex",
          flexDirection: "column",
          gap: 12,
          background:
            "linear-gradient(180deg, rgba(15,23,42,0.98) 0%, rgba(10,20,46,0.98) 100%)",
          borderLeft: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "-12px 0 28px rgba(0,0,0,0.28)",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto",
            alignItems: "start",
            gap: 12,
          }}
        >
          <div>
            <div
              style={{
                fontSize: 18,
                fontWeight: 950,
                lineHeight: 1.05,
              }}
            >
              Activos reales
            </div>

            <div
              style={{
                marginTop: 4,
                fontSize: 12,
                color: "rgba(255,255,255,0.68)",
                lineHeight: 1.3,
              }}
            >
              Tanques, bombas y puntos de presión desde SCADA / backend
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              width: 42,
              height: 42,
              borderRadius: 14,
              border: "1px solid rgba(255,255,255,0.14)",
              background: "rgba(255,255,255,0.05)",
              color: "#fff",
              fontWeight: 950,
              fontSize: 22,
              lineHeight: 1,
              cursor: "pointer",
              flex: "0 0 auto",
            }}
            title="Cerrar panel"
          >
            ×
          </button>
        </div>

        {/* Counters */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 8,
          }}
        >
          <StatCard label="Total" value={counters.total} />
          <StatCard label="Online" value={counters.online} />
          <StatCard label="Ubicados" value={counters.linked} />
          <StatCard label="Tanques" value={counters.tanks} />
          <StatCard label="Presión" value={counters.manifolds} />
          <StatCard label="Bombas" value={counters.pumps} />
        </div>

        {/* Filters */}
        <div
          style={{
            borderRadius: 16,
            padding: 12,
            background: "rgba(255,255,255,0.035)",
            border: "1px solid rgba(255,255,255,0.08)",
            display: "grid",
            gap: 10,
          }}
        >
          <SectionTitle>Filtros</SectionTitle>

          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar activo..."
            style={inputStyle}
          />

          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
            <button onClick={() => setTypeFilter("ALL")} style={quickBtn(typeFilter === "ALL")}>
              Todos
            </button>
            <button onClick={() => setTypeFilter("TANK")} style={quickBtn(typeFilter === "TANK")}>
              TK
            </button>
            <button
              onClick={() => setTypeFilter("MANIFOLD")}
              style={quickBtn(typeFilter === "MANIFOLD")}
            >
              Pres.
            </button>
            <button onClick={() => setTypeFilter("PUMP")} style={quickBtn(typeFilter === "PUMP")}>
              Bomb.
            </button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <select
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
              style={selectStyle}
            >
              <option value="ALL">Todas las localidades</option>
              {locations.map((loc) => (
                <option key={loc} value={String(loc)}>
                  Localidad {loc}
                </option>
              ))}
            </select>

            <select
              value={mapFilter}
              onChange={(e) => setMapFilter(e.target.value as MapFilter)}
              style={selectStyle}
            >
              <option value="ALL">Todos</option>
              <option value="LINKED">Ubicados</option>
              <option value="UNLINKED">Sin ubicar</option>
            </select>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <select
              value={liveFilter}
              onChange={(e) => setLiveFilter(e.target.value as LiveFilter)}
              style={selectStyle}
            >
              <option value="ALL">Cualquier estado</option>
              <option value="ONLINE">Online</option>
              <option value="STALE">Viejo</option>
              <option value="NO_DATA">Sin dato</option>
            </select>

            <button onClick={onRefresh} disabled={busy} style={primaryBtn(busy)}>
              {busy ? "Actualizando..." : "Actualizar"}
            </button>
          </div>

          <div
            style={{
              fontSize: 12,
              color: "rgba(255,255,255,0.65)",
            }}
          >
            Mostrando {filteredAssets.length} de {safeAssets.length} activos
          </div>

          {error && (
            <div
              style={{
                padding: "9px 10px",
                borderRadius: 12,
                background: "rgba(220,38,38,0.16)",
                border: "1px solid rgba(220,38,38,0.34)",
                color: "#fff",
                fontSize: 12,
                fontWeight: 800,
              }}
            >
              {error}
            </div>
          )}
        </div>

        {/* Selected asset */}
        {selectedAsset && (
          <div
            style={{
              borderRadius: 16,
              padding: 12,
              background: "rgba(34,211,238,0.08)",
              border: "1px solid rgba(34,211,238,0.18)",
              display: "grid",
              gap: 10,
            }}
          >
            <div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.68)", textTransform: "uppercase", letterSpacing: 0.5 }}>
                Seleccionado
              </div>

              <div style={{ fontWeight: 950, fontSize: 16, marginTop: 4 }}>
                {assetDisplayName(selectedAsset)}
              </div>

              <div
                style={{
                  marginTop: 4,
                  fontSize: 12,
                  color: "rgba(255,255,255,0.72)",
                  lineHeight: 1.35,
                }}
              >
                {assetTypeLabel(selectedAsset.asset_type)} · Loc.{" "}
                {selectedAsset.location_id ?? "—"} · {metricText(selectedAsset)}
              </div>

              <div
                style={{
                  marginTop: 4,
                  fontSize: 12,
                  color: "rgba(255,255,255,0.72)",
                }}
              >
                {selectedAsset.linked_to_map ? "Ubicado en mapa" : "Sin ubicar"} ·{" "}
                {liveStatusLabel(selectedAsset.live_status)}
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <button
                onClick={onStartLinkNode}
                style={actionBtn(linkMode === "node", "rgba(34,197,94,0.92)")}
              >
                Ubicar en nodo
              </button>

              <button
                onClick={onStartLinkPipe}
                style={actionBtn(linkMode === "pipe", "rgba(34,197,94,0.92)")}
              >
                Ubicar en cañería
              </button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <button
                onClick={onCancelLink}
                disabled={linkMode === "none"}
                style={actionBtn(false, "rgba(100,116,139,0.95)", linkMode === "none")}
              >
                Cancelar
              </button>

              <button
                onClick={onUnlink}
                disabled={!selectedAsset.linked_to_map}
                style={actionBtn(
                  selectedAsset.linked_to_map,
                  "rgba(220,38,38,0.88)",
                  !selectedAsset.linked_to_map
                )}
              >
                Desubicar
              </button>
            </div>

            {linkMode !== "none" && (
              <div
                style={{
                  fontSize: 12,
                  color: "rgba(255,255,255,0.72)",
                }}
              >
                {linkMode === "node"
                  ? "Tocá un nodo en el mapa para asociar este activo."
                  : "Tocá una cañería en el mapa para asociar este activo."}
              </div>
            )}
          </div>
        )}

        {/* List */}
        <div
          style={{
            minHeight: 0,
            flex: 1,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 950,
              letterSpacing: 0.6,
              textTransform: "uppercase",
              color: "rgba(255,255,255,0.68)",
              marginBottom: 8,
            }}
          >
            Lista de activos
          </div>

          <div
            style={{
              minHeight: 0,
              flex: 1,
              overflowY: "auto",
              paddingRight: 4,
              display: "grid",
              gap: 8,
            }}
          >
            {filteredAssets.map((a) => {
              const selected = selectedAsset?.asset_link_id === a.asset_link_id;

              return (
                <button
                  key={a.asset_link_id}
                  onClick={() => onSelectAsset(a)}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    borderRadius: 16,
                    padding: "12px 12px",
                    border: selected
                      ? "1px solid rgba(34,211,238,0.38)"
                      : "1px solid rgba(255,255,255,0.08)",
                    background: selected
                      ? "rgba(34,211,238,0.12)"
                      : "rgba(255,255,255,0.045)",
                    color: "#fff",
                    cursor: "pointer",
                    display: "grid",
                    gap: 6,
                  }}
                >
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr auto",
                      gap: 10,
                      alignItems: "start",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                      <span
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: 99,
                          background: liveStatusColor(a.live_status),
                          boxShadow: `0 0 0 3px ${liveStatusColor(a.live_status)}22`,
                          flex: "0 0 auto",
                          marginTop: 2,
                        }}
                      />

                      <div
                        style={{
                          fontWeight: 950,
                          fontSize: 13,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                        title={assetDisplayName(a)}
                      >
                        {assetDisplayName(a)}
                      </div>
                    </div>

                    <div
                      style={{
                        fontSize: 11,
                        color: "rgba(255,255,255,0.7)",
                        fontWeight: 800,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {assetTypeLabel(a.asset_type)}
                    </div>
                  </div>

                  <div
                    style={{
                      fontSize: 13,
                      color: "rgba(255,255,255,0.9)",
                    }}
                  >
                    {metricText(a)}
                  </div>

                  <div
                    style={{
                      fontSize: 12,
                      color: "rgba(255,255,255,0.68)",
                      lineHeight: 1.35,
                    }}
                  >
                    Loc. {a.location_id ?? "—"} ·{" "}
                    {a.linked_to_map ? "Ubicado" : "Sin ubicar"} ·{" "}
                    {liveStatusLabel(a.live_status)}
                  </div>
                </button>
              );
            })}

            {!busy && filteredAssets.length === 0 && (
              <div
                style={{
                  borderRadius: 14,
                  padding: "14px 12px",
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  fontSize: 13,
                  color: "rgba(255,255,255,0.66)",
                }}
              >
                No hay activos que coincidan con los filtros actuales.
              </div>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}