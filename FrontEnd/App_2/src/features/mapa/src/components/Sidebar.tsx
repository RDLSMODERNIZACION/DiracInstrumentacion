import React, { useMemo, useState } from "react";
import {
  type Asset,
  type Edge,
  type Zone,
  barrios,
  zones,
  valveRouting,
} from "../data/demo";

export type SidebarMode = "NONE" | "ZONE" | "ASSET";
export type ZoneTab =
  | "VALVES"
  | "TANKS"
  | "PUMPS"
  | "MANIFOLDS"
  | "PIPES"
  | "BARRIOS";

export type ViewMode = "ALL" | "ZONES" | "PIPES" | "BARRIOS";

type LocationInventory = {
  valves: Asset[];
  pumps: Asset[];
  tanks: Asset[];
  manifolds: Asset[];
  barrios: typeof barrios;
  pipes: Edge[];
};

function dotColor(status: Asset["status"]) {
  switch (status) {
    case "OK":
      return "var(--ok)";
    case "WARN":
      return "var(--warn)";
    case "ALARM":
      return "var(--alarm)";
    case "OFF":
      return "var(--off)";
    default:
      return "var(--off)";
  }
}

function edgeColor(type: Edge["type"]) {
  return type === "WATER" ? "var(--water)" : "var(--sludge)";
}

function assetTypeLabel(t: Asset["type"]) {
  switch (t) {
    case "TANK":
      return "Tanque";
    case "PUMP":
      return "Bomba";
    case "VALVE":
      return "Válvula";
    case "MANIFOLD":
      return "Manifold";
  }
}

function edgeRequiresOpen(e: Edge): string[] {
  const ro = (e.meta as any)?.requiresOpen;
  return Array.isArray(ro) ? ro.filter((x) => typeof x === "string") : [];
}

function pipeLabel(e: Edge, assetsById: Map<string, Asset>) {
  const from = assetsById.get(e.from)?.name ?? e.from;
  const to = assetsById.get(e.to)?.name ?? e.to;
  const nm = (e.meta as any)?.name;
  return nm ?? `${from} → ${to}`;
}

function getValveTargets(args: { valveId: string; assetsById: Map<string, Asset> }) {
  const { valveId, assetsById } = args;
  const rt = valveRouting[valveId];
  const targets = rt?.targets ?? [];

  const barrioNames: string[] = [];
  const locationNames: string[] = [];
  const assetNames: string[] = [];

  for (const t of targets) {
    if (t.kind === "BARRIO") {
      const b = barrios.find((x) => x.id === t.barrioId);
      barrioNames.push(b?.name ?? t.barrioId);
      continue;
    }
    if (t.kind === "LOCATION") {
      const z = zones.find((x) => x.id === t.locationId);
      locationNames.push(z?.name ?? t.locationId);
      continue;
    }
    if (t.kind === "ASSET") {
      const a = assetsById.get(t.assetId);
      assetNames.push(a?.name ?? t.assetId);
      continue;
    }
  }

  return { barrioNames, locationNames, assetNames, note: rt?.note ?? null };
}

function Chip({ text }: { text: string }) {
  return (
    <span
      className="pill"
      style={{
        display: "inline-flex",
        gap: 6,
        alignItems: "center",
        padding: "6px 10px",
        borderRadius: 999,
        background: "rgba(0,0,0,0.04)",
        border: "1px solid rgba(0,0,0,0.10)",
        color: "rgba(0,0,0,0.82)",
        fontSize: 12,
        lineHeight: "12px",
        maxWidth: 320,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      }}
      title={text}
    >
      {text}
    </span>
  );
}

export function Sidebar(props: {
  mode: SidebarMode;
  selectedZone: Zone | null;
  selectedAsset: Asset | null;

  zoneTab: ZoneTab;
  setZoneTab: (t: ZoneTab) => void;

  locationInventory: LocationInventory;

  valveEnabled: Record<string, boolean>;
  onToggleValve: (id: string) => void;

  onReset: () => void;

  assetsById: Map<string, Asset>;

  activeValveId: string | null;
  setActiveValveId: (id: string | null) => void;

  showValveImpact: boolean;

  viewMode: ViewMode;
  setViewMode: (m: ViewMode) => void;
  viewSelectedId: string | null;
  setViewSelectedId: (id: string | null) => void;

  zonesAll: Zone[];
  barriosAll: typeof barrios;
  edgesAll: Edge[];
}) {
  const {
    mode,
    selectedZone,
    selectedAsset,
    zoneTab,
    setZoneTab,
    locationInventory,
    valveEnabled,
    onToggleValve,
    onReset,
    assetsById,
    activeValveId,
    setActiveValveId,
    showValveImpact,
    viewMode,
    setViewMode,
    viewSelectedId,
    setViewSelectedId,
    zonesAll,
    barriosAll,
    edgesAll,
  } = props;

  // ✅ NUEVO: colapsar / desplegar
  const [collapsed, setCollapsed] = useState(false);

  const TabBtn = ({ id, label }: { id: ZoneTab; label: string }) => (
    <button
      className="btn"
      onClick={() => setZoneTab(id)}
      style={{
        opacity: zoneTab === id ? 1 : 0.75,
        borderColor: zoneTab === id ? "rgba(2,132,199,0.35)" : "rgba(0,0,0,0.10)",
        background: zoneTab === id ? "rgba(2,132,199,0.10)" : "rgba(0,0,0,0.02)",
        color: "rgba(0,0,0,0.86)",
      }}
    >
      {label}
    </button>
  );

  const ModeBtn = ({ id, label }: { id: ViewMode; label: string }) => (
    <button
      className="btn"
      onClick={() => {
        setViewMode(id);
        setViewSelectedId(null);
      }}
      style={{
        opacity: viewMode === id ? 1 : 0.75,
        borderColor: viewMode === id ? "rgba(2,132,199,0.35)" : "rgba(0,0,0,0.10)",
        background: viewMode === id ? "rgba(2,132,199,0.10)" : "rgba(0,0,0,0.02)",
        color: "rgba(0,0,0,0.86)",
      }}
    >
      {label}
    </button>
  );

  const valveImpact = useMemo(() => {
    if (!activeValveId) return null;

    const v = assetsById.get(activeValveId);
    const { barrioNames, locationNames, assetNames, note } = getValveTargets({
      valveId: activeValveId,
      assetsById,
    });

    const pipes = (locationInventory.pipes ?? []).filter((e) => {
      if (e.from === activeValveId || e.to === activeValveId) return true;
      const ro = edgeRequiresOpen(e);
      return ro.includes(activeValveId);
    });

    const pipeItems = pipes.map((e) => ({
      id: e.id,
      label: pipeLabel(e, assetsById),
      type: e.type,
      requires: edgeRequiresOpen(e),
    }));

    return {
      valveName: v?.name ?? activeValveId,
      barrioNames,
      locationNames,
      assetNames,
      note,
      pipeItems,
    };
  }, [activeValveId, assetsById, locationInventory.pipes]);

  // ✅ estilos base blancos (sin tocar tu CSS global)
  const shellStyle: React.CSSProperties = {
    position: "relative",
    height: "100%",
    display: "flex",
    flexDirection: "column",
    background: "#fff",
    color: "#111",
    borderRight: "1px solid rgba(0,0,0,0.08)",
    boxShadow: "0 8px 24px rgba(0,0,0,0.06)",
    overflow: "hidden",
  };

  const headerStyle: React.CSSProperties = {
    position: "sticky",
    top: 0,
    zIndex: 2,
    background: "#fff",
    borderBottom: "1px solid rgba(0,0,0,0.08)",
    padding: 12,
  };

  const cardStyle: React.CSSProperties = {
    background: "#fff",
    border: "1px solid rgba(0,0,0,0.10)",
    borderRadius: 14,
    padding: 12,
  };

  const sectionTitleStyle: React.CSSProperties = {
    fontWeight: 900,
    fontSize: 12,
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: "rgba(0,0,0,0.65)",
  };

  const mutedText: React.CSSProperties = { color: "rgba(0,0,0,0.55)" };

  // ✅ pestaña de colapso (cuando está cerrado)
  if (collapsed) {
    return (
      <div
        className="sidebar"
        style={{
          ...shellStyle,
          width: 44,
          alignItems: "stretch",
          justifyContent: "flex-start",
        }}
      >
        <button
          onClick={() => setCollapsed(false)}
          title="Desplegar"
          aria-label="Desplegar sidebar"
          style={{
            margin: 8,
            height: 36,
            borderRadius: 12,
            border: "1px solid rgba(0,0,0,0.12)",
            background: "rgba(0,0,0,0.02)",
            cursor: "pointer",
            fontSize: 16,
            fontWeight: 900,
            color: "rgba(0,0,0,0.75)",
          }}
        >
          ▶
        </button>
      </div>
    );
  }

  return (
    <div className="sidebar" style={shellStyle}>
      {/* Header blanco + flechita */}
      <div className="header" style={headerStyle}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
          <div className="brand" style={{ minWidth: 0 }}>
            <div className="brandTitle" style={{ fontWeight: 900, fontSize: 14 }}>
              Localidades
            </div>
            <div className="brandSub" style={{ fontSize: 12, marginTop: 4, ...mutedText }}>
              {mode === "ZONE" && selectedZone ? (
                <>
                  <span style={{ fontWeight: 800, color: "rgba(0,0,0,0.85)" }}>{selectedZone.name}</span>{" "}
                  <span style={mutedText}>· {selectedZone.id}</span>
                </>
              ) : (
                <span style={mutedText}>Seleccioná una localidad en el mapa</span>
              )}
            </div>
          </div>

          <button
            onClick={() => setCollapsed(true)}
            title="Colapsar"
            aria-label="Colapsar sidebar"
            style={{
              flex: "0 0 auto",
              height: 34,
              width: 38,
              borderRadius: 12,
              border: "1px solid rgba(0,0,0,0.12)",
              background: "rgba(0,0,0,0.02)",
              cursor: "pointer",
              fontSize: 16,
              fontWeight: 900,
              color: "rgba(0,0,0,0.75)",
            }}
          >
            ◀
          </button>
        </div>

        <div className="btnRow" style={{ marginTop: 10, display: "flex", gap: 8 }}>
          <button
            className="btn"
            onClick={onReset}
            style={{
              borderColor: "rgba(0,0,0,0.12)",
              background: "rgba(0,0,0,0.02)",
              color: "rgba(0,0,0,0.85)",
            }}
          >
            Limpiar
          </button>
        </div>
      </div>

      {/* contenido scrolleable */}
      <div style={{ padding: 12, overflowY: "auto" }}>
        {/* ✅ VISTA / FILTRO */}
        <div className="card" style={cardStyle}>
          <div className="sectionTitle" style={sectionTitleStyle}>
            Vista
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
            <ModeBtn id="ALL" label="Todos" />
            <ModeBtn id="ZONES" label="Localidades" />
            <ModeBtn id="PIPES" label="Cañerías" />
            <ModeBtn id="BARRIOS" label="Barrios" />
          </div>

          {viewMode !== "ALL" && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 12, ...mutedText, marginBottom: 8 }}>
                Seleccioná un ítem (si no, se muestran todos).
              </div>

              {viewMode === "ZONES" && (
                <div className="list">
                  {zonesAll.map((z) => {
                    const active = viewSelectedId === z.id;
                    return (
                      <div
                        key={z.id}
                        className="item"
                        style={{
                          borderColor: active ? "rgba(2,132,199,0.30)" : "rgba(0,0,0,0.08)",
                          background: active ? "rgba(2,132,199,0.06)" : "rgba(0,0,0,0.01)",
                          cursor: "pointer",
                          borderRadius: 12,
                          padding: 10,
                          marginTop: 8,
                          borderWidth: 1,
                          borderStyle: "solid",
                        }}
                        onClick={() => setViewSelectedId(active ? null : z.id)}
                      >
                        <div className="itemLeft" style={{ display: "flex", gap: 10, alignItems: "center" }}>
                          <span className="dot" style={{ width: 10, height: 10, borderRadius: 999, background: "var(--zone)" }} />
                          <div style={{ minWidth: 0 }}>
                            <div className="itemTitle" style={{ fontWeight: 800, fontSize: 12 }}>
                              {z.name}
                            </div>
                            <div className="itemSub" style={{ fontSize: 12, ...mutedText }}>
                              {z.id}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {viewMode === "BARRIOS" && (
                <div className="list">
                  {barriosAll.map((b) => {
                    const active = viewSelectedId === b.id;
                    return (
                      <div
                        key={b.id}
                        className="item"
                        style={{
                          borderColor: active ? "rgba(2,132,199,0.30)" : "rgba(0,0,0,0.08)",
                          background: active ? "rgba(2,132,199,0.06)" : "rgba(0,0,0,0.01)",
                          cursor: "pointer",
                          borderRadius: 12,
                          padding: 10,
                          marginTop: 8,
                          borderWidth: 1,
                          borderStyle: "solid",
                        }}
                        onClick={() => setViewSelectedId(active ? null : b.id)}
                      >
                        <div className="itemLeft" style={{ display: "flex", gap: 10, alignItems: "center" }}>
                          <span className="dot" style={{ width: 10, height: 10, borderRadius: 999, background: "rgba(0,0,0,0.45)" }} />
                          <div style={{ minWidth: 0 }}>
                            <div className="itemTitle" style={{ fontWeight: 800, fontSize: 12 }}>
                              {b.name}
                            </div>
                            <div className="itemSub" style={{ fontSize: 12, ...mutedText }}>
                              {b.locationId} · {b.id}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {viewMode === "PIPES" && (
                <div className="list">
                  {edgesAll.map((e) => {
                    const active = viewSelectedId === e.id;
                    const title = (e.meta as any)?.name ?? e.id;
                    return (
                      <div
                        key={e.id}
                        className="item"
                        style={{
                          borderColor: active ? "rgba(2,132,199,0.30)" : "rgba(0,0,0,0.08)",
                          background: active ? "rgba(2,132,199,0.06)" : "rgba(0,0,0,0.01)",
                          cursor: "pointer",
                          borderRadius: 12,
                          padding: 10,
                          marginTop: 8,
                          borderWidth: 1,
                          borderStyle: "solid",
                        }}
                        onClick={() => setViewSelectedId(active ? null : e.id)}
                      >
                        <div className="itemLeft" style={{ display: "flex", gap: 10, alignItems: "center" }}>
                          <span className="dot" style={{ width: 10, height: 10, borderRadius: 999, background: edgeColor(e.type) }} />
                          <div style={{ minWidth: 0 }}>
                            <div className="itemTitle" style={{ fontWeight: 800, fontSize: 12 }}>
                              {title}
                            </div>
                            <div className="itemSub" style={{ fontSize: 12, ...mutedText }}>
                              {e.from} → {e.to}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Estado NONE */}
        {mode === "NONE" && (
          <div className="card" style={{ ...cardStyle, marginTop: 10 }}>
            <div className="sectionTitle" style={sectionTitleStyle}>
              Operación
            </div>
            <div style={{ fontSize: 12, ...mutedText, marginTop: 8 }}>
              • Click en una localidad para ver activos y conexiones.<br />
              • En válvulas, tocá una fila para ver el impacto real (barrios o cañerías).
            </div>
          </div>
        )}

        {/* Localidad */}
        {mode === "ZONE" && selectedZone && (
          <div className="card" style={{ ...cardStyle, marginTop: 10 }}>
            <div className="sectionTitle" style={sectionTitleStyle}>
              Localidad
            </div>

            <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8, flexWrap: "wrap" }}>
              <span
                className="pill"
                style={{
                  display: "inline-flex",
                  gap: 8,
                  alignItems: "center",
                  padding: "6px 10px",
                  borderRadius: 999,
                  background: "rgba(0,0,0,0.03)",
                  border: "1px solid rgba(0,0,0,0.10)",
                  color: "rgba(0,0,0,0.85)",
                  fontSize: 12,
                }}
              >
                <span className="dot" style={{ width: 10, height: 10, borderRadius: 999, background: "var(--zone)" }} />{" "}
                {selectedZone.id}
              </span>
              <div style={{ fontWeight: 900, fontSize: 14 }}>{selectedZone.name}</div>
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
              <TabBtn id="VALVES" label={`Válvulas (${locationInventory.valves.length})`} />
              <TabBtn id="TANKS" label={`Tanques (${locationInventory.tanks.length})`} />
              <TabBtn id="PUMPS" label={`Bombas (${locationInventory.pumps.length})`} />
              <TabBtn id="MANIFOLDS" label={`Manifolds (${locationInventory.manifolds.length})`} />
              <TabBtn id="PIPES" label={`Cañerías (${locationInventory.pipes.length})`} />
              <TabBtn id="BARRIOS" label={`Barrios (${locationInventory.barrios.length})`} />
            </div>

            {/* TAB: VALVES */}
            {zoneTab === "VALVES" && (
              <div style={{ marginTop: 12 }}>
                <div className="sectionTitle" style={sectionTitleStyle}>
                  Válvulas
                </div>

                <div className="list" style={{ marginTop: 8 }}>
                  {locationInventory.valves.map((v) => {
                    const on = valveEnabled[v.id] !== false;
                    const isActive = activeValveId === v.id;

                    return (
                      <div
                        key={v.id}
                        className="item"
                        style={{
                          borderRadius: 12,
                          padding: 10,
                          marginTop: 8,
                          border: "1px solid " + (isActive ? "rgba(2,132,199,0.30)" : "rgba(0,0,0,0.08)"),
                          background: isActive ? "rgba(2,132,199,0.06)" : "rgba(0,0,0,0.01)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 10,
                        }}
                      >
                        <div
                          className="itemLeft"
                          role="button"
                          onClick={() => setActiveValveId((cur) => (cur === v.id ? null : v.id))}
                          style={{ cursor: "pointer", display: "flex", gap: 10, alignItems: "center", minWidth: 0 }}
                          title="Ver impacto"
                        >
                          <span
                            className="dot"
                            style={{ width: 10, height: 10, borderRadius: 999, background: dotColor(v.status) }}
                          />
                          <div style={{ minWidth: 0 }}>
                            <div className="itemTitle" style={{ fontWeight: 800, fontSize: 12 }}>
                              {v.name}
                            </div>
                            <div className="itemSub" style={{ fontSize: 12, ...mutedText }}>
                              {on ? "Operativa" : "Cerrada"} · {v.id}
                            </div>
                          </div>
                        </div>

                        <div
                          className={"switch " + (on ? "on" : "")}
                          onClick={() => {
                            onToggleValve(v.id);
                            setActiveValveId(v.id);
                          }}
                          title="Activar / desactivar"
                        >
                          <div className="switchKnob" />
                        </div>
                      </div>
                    );
                  })}

                  {locationInventory.valves.length === 0 && (
                    <div style={{ fontSize: 12, ...mutedText, marginTop: 8 }}>
                      No hay válvulas cargadas para esta localidad.
                    </div>
                  )}
                </div>

                {showValveImpact && valveImpact && (
                  <div
                    style={{
                      marginTop: 12,
                      padding: 12,
                      borderRadius: 14,
                      background: "rgba(0,0,0,0.02)",
                      border: "1px solid rgba(0,0,0,0.10)",
                    }}
                  >
                    <div style={sectionTitleStyle}>Impacto</div>
                    <div style={{ marginTop: 6, fontWeight: 900, fontSize: 14 }}>
                      {valveImpact.valveName}
                    </div>

                    <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                      {valveImpact.barrioNames.length > 0 && (
                        <div>
                          <div style={{ fontSize: 12, ...mutedText, marginBottom: 6 }}>Barrios</div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                            {valveImpact.barrioNames.map((n) => (
                              <Chip key={n} text={n} />
                            ))}
                          </div>
                        </div>
                      )}

                      {!!valveImpact.locationNames.length && (
                        <div>
                          <div style={{ fontSize: 12, ...mutedText, marginBottom: 6 }}>Localidades</div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                            {valveImpact.locationNames.map((n) => (
                              <Chip key={n} text={n} />
                            ))}
                          </div>
                        </div>
                      )}

                      {valveImpact.pipeItems.length > 0 && (
                        <div>
                          <div style={{ fontSize: 12, ...mutedText, marginBottom: 6 }}>Cañerías</div>
                          <div style={{ display: "grid", gap: 8 }}>
                            {valveImpact.pipeItems.map((p) => (
                              <div
                                key={p.id}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "space-between",
                                  gap: 10,
                                  padding: "8px 10px",
                                  borderRadius: 12,
                                  background: "rgba(0,0,0,0.02)",
                                  border: "1px solid rgba(0,0,0,0.08)",
                                }}
                              >
                                <div style={{ minWidth: 0 }}>
                                  <div
                                    style={{
                                      fontWeight: 800,
                                      fontSize: 12,
                                      overflow: "hidden",
                                      textOverflow: "ellipsis",
                                      whiteSpace: "nowrap",
                                    }}
                                  >
                                    {p.label}
                                  </div>
                                  {p.requires.length ? (
                                    <div style={{ fontSize: 12, ...mutedText, marginTop: 2 }}>
                                      Requiere: {p.requires.join(", ")}
                                    </div>
                                  ) : (
                                    <div style={{ fontSize: 12, ...mutedText, marginTop: 2 }}>
                                      Sin prerequisitos
                                    </div>
                                  )}
                                </div>
                                <span
                                  className="pill"
                                  style={{
                                    display: "inline-flex",
                                    gap: 8,
                                    alignItems: "center",
                                    padding: "6px 10px",
                                    borderRadius: 999,
                                    background: "rgba(0,0,0,0.03)",
                                    border: "1px solid rgba(0,0,0,0.10)",
                                    color: "rgba(0,0,0,0.85)",
                                    fontSize: 12,
                                  }}
                                >
                                  <span className="dot" style={{ width: 10, height: 10, borderRadius: 999, background: edgeColor(p.type) }} />{" "}
                                  {p.type}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {valveImpact.note && (
                        <div style={{ fontSize: 12, ...mutedText }}>
                          Nota: {valveImpact.note}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {!showValveImpact && activeValveId && (
                  <div style={{ marginTop: 10, fontSize: 12, ...mutedText }}>
                    Esta válvula no alimenta barrios ni una cañería hacia otra localidad.
                  </div>
                )}
              </div>
            )}

            {/* TAB: TANKS */}
            {zoneTab === "TANKS" && (
              <div style={{ marginTop: 12 }}>
                <div className="sectionTitle" style={sectionTitleStyle}>
                  Tanques
                </div>
                <div className="list" style={{ marginTop: 8 }}>
                  {locationInventory.tanks.map((t) => (
                    <div
                      key={t.id}
                      className="item"
                      style={{
                        borderRadius: 12,
                        padding: 10,
                        marginTop: 8,
                        border: "1px solid rgba(0,0,0,0.08)",
                        background: "rgba(0,0,0,0.01)",
                      }}
                    >
                      <div className="itemLeft" role="button" style={{ display: "flex", gap: 10, alignItems: "center" }}>
                        <span className="dot" style={{ width: 10, height: 10, borderRadius: 999, background: dotColor(t.status) }} />
                        <div style={{ minWidth: 0 }}>
                          <div className="itemTitle" style={{ fontWeight: 800, fontSize: 12 }}>
                            {t.name}
                          </div>
                          <div className="itemSub" style={{ fontSize: 12, ...mutedText }}>
                            {String(t.meta.nivel_pct ?? "—")} % · {String(t.meta.autonomia_h ?? "—")} h
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                  {locationInventory.tanks.length === 0 && (
                    <div style={{ fontSize: 12, ...mutedText, marginTop: 8 }}>Sin tanques cargados.</div>
                  )}
                </div>
              </div>
            )}

            {/* TAB: PUMPS */}
            {zoneTab === "PUMPS" && (
              <div style={{ marginTop: 12 }}>
                <div className="sectionTitle" style={sectionTitleStyle}>
                  Bombas
                </div>
                <div className="list" style={{ marginTop: 8 }}>
                  {locationInventory.pumps.map((p) => (
                    <div
                      key={p.id}
                      className="item"
                      style={{
                        borderRadius: 12,
                        padding: 10,
                        marginTop: 8,
                        border: "1px solid rgba(0,0,0,0.08)",
                        background: "rgba(0,0,0,0.01)",
                      }}
                    >
                      <div className="itemLeft" role="button" style={{ display: "flex", gap: 10, alignItems: "center" }}>
                        <span className="dot" style={{ width: 10, height: 10, borderRadius: 999, background: dotColor(p.status) }} />
                        <div style={{ minWidth: 0 }}>
                          <div className="itemTitle" style={{ fontWeight: 800, fontSize: 12 }}>
                            {p.name}
                          </div>
                          <div className="itemSub" style={{ fontSize: 12, ...mutedText }}>
                            Estado: {String(p.meta.estado ?? "—")} · Hz: {String(p.meta.hz ?? "—")} · kW:{" "}
                            {String(p.meta.kw ?? "—")}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                  {locationInventory.pumps.length === 0 && (
                    <div style={{ fontSize: 12, ...mutedText, marginTop: 8 }}>Sin bombas cargadas.</div>
                  )}
                </div>
              </div>
            )}

            {/* TAB: MANIFOLDS */}
            {zoneTab === "MANIFOLDS" && (
              <div style={{ marginTop: 12 }}>
                <div className="sectionTitle" style={sectionTitleStyle}>
                  Manifolds
                </div>
                <div className="list" style={{ marginTop: 8 }}>
                  {locationInventory.manifolds.map((m) => (
                    <div
                      key={m.id}
                      className="item"
                      style={{
                        borderRadius: 12,
                        padding: 10,
                        marginTop: 8,
                        border: "1px solid rgba(0,0,0,0.08)",
                        background: "rgba(0,0,0,0.01)",
                      }}
                    >
                      <div className="itemLeft" role="button" style={{ display: "flex", gap: 10, alignItems: "center" }}>
                        <span className="dot" style={{ width: 10, height: 10, borderRadius: 999, background: dotColor(m.status) }} />
                        <div style={{ minWidth: 0 }}>
                          <div className="itemTitle" style={{ fontWeight: 800, fontSize: 12 }}>
                            {m.name}
                          </div>
                          <div className="itemSub" style={{ fontSize: 12, ...mutedText }}>
                            {String(m.meta.presion_psi ?? "—")} psi · {String(m.meta.caudal_m3h ?? "—")} m³/h
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                  {locationInventory.manifolds.length === 0 && (
                    <div style={{ fontSize: 12, ...mutedText, marginTop: 8 }}>Sin manifolds cargados.</div>
                  )}
                </div>
              </div>
            )}

            {/* TAB: PIPES */}
            {zoneTab === "PIPES" && (
              <div style={{ marginTop: 12 }}>
                <div className="sectionTitle" style={sectionTitleStyle}>
                  Cañerías / Conexiones
                </div>
                <div className="list" style={{ marginTop: 8 }}>
                  {locationInventory.pipes.map((e) => {
                    const from = assetsById.get(e.from);
                    const to = assetsById.get(e.to);
                    return (
                      <div
                        key={e.id}
                        className="item"
                        style={{
                          borderRadius: 12,
                          padding: 10,
                          marginTop: 8,
                          border: "1px solid rgba(0,0,0,0.08)",
                          background: "rgba(0,0,0,0.01)",
                        }}
                      >
                        <div className="itemLeft" role="button" style={{ display: "flex", gap: 10, alignItems: "center" }}>
                          <span className="dot" style={{ width: 10, height: 10, borderRadius: 999, background: edgeColor(e.type) }} />
                          <div style={{ minWidth: 0 }}>
                            <div className="itemTitle" style={{ fontWeight: 800, fontSize: 12 }}>
                              {from?.name ?? e.from} → {to?.name ?? e.to}
                            </div>
                            <div className="itemSub" style={{ fontSize: 12, ...mutedText }}>
                              Tipo: {e.type} · {from?.locationId ?? "?"} → {to?.locationId ?? "?"}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {locationInventory.pipes.length === 0 && (
                    <div style={{ fontSize: 12, ...mutedText, marginTop: 8 }}>Sin cañerías asociadas.</div>
                  )}
                </div>
              </div>
            )}

            {/* TAB: BARRIOS */}
            {zoneTab === "BARRIOS" && (
              <div style={{ marginTop: 12 }}>
                <div className="sectionTitle" style={sectionTitleStyle}>
                  Barrios
                </div>
                <div className="list" style={{ marginTop: 8 }}>
                  {locationInventory.barrios.map((b) => (
                    <div
                      key={b.id}
                      className="item"
                      style={{
                        borderRadius: 12,
                        padding: 10,
                        marginTop: 8,
                        border: "1px solid rgba(0,0,0,0.08)",
                        background: "rgba(0,0,0,0.01)",
                      }}
                    >
                      <div className="itemLeft" role="button" style={{ display: "flex", gap: 10, alignItems: "center" }}>
                        <span className="dot" style={{ width: 10, height: 10, borderRadius: 999, background: "rgba(0,0,0,0.45)" }} />
                        <div style={{ minWidth: 0 }}>
                          <div className="itemTitle" style={{ fontWeight: 800, fontSize: 12 }}>
                            {b.name}
                          </div>
                          <div className="itemSub" style={{ fontSize: 12, ...mutedText }}>
                            Alimentado por: {b.meta.alimentado_por}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                  {locationInventory.barrios.length === 0 && (
                    <div style={{ fontSize: 12, ...mutedText, marginTop: 8 }}>Sin barrios cargados.</div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ASSET */}
        {mode === "ASSET" && selectedAsset && (
          <div className="card" style={{ ...cardStyle, marginTop: 10 }}>
            <div className="sectionTitle" style={sectionTitleStyle}>
              Activo
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
              <span className="dot" style={{ width: 10, height: 10, borderRadius: 999, background: dotColor(selectedAsset.status) }} />
              <div>
                <div style={{ fontWeight: 900, fontSize: 14 }}>{selectedAsset.name}</div>
                <div style={{ fontSize: 12, ...mutedText }}>
                  {assetTypeLabel(selectedAsset.type)} · {selectedAsset.status} · {selectedAsset.locationId}
                </div>
              </div>
            </div>

            {selectedAsset.type === "VALVE" && (
              <div style={{ marginTop: 12 }}>
                <div className="sectionTitle" style={sectionTitleStyle}>
                  Control
                </div>
                <div
                  className={"switch " + (props.valveEnabled[selectedAsset.id] !== false ? "on" : "")}
                  onClick={() => onToggleValve(selectedAsset.id)}
                  title="Activar / desactivar"
                  style={{ marginTop: 8 }}
                >
                  <div className="switchKnob" />
                </div>

                <div style={{ marginTop: 10, fontSize: 12, ...mutedText }}>
                  Destinos:{" "}
                  {(() => {
                    const t = getValveTargets({ valveId: selectedAsset.id, assetsById });
                    const parts = [
                      ...t.barrioNames.map((x) => `Barrio: ${x}`),
                      ...t.locationNames.map((x) => `Localidad: ${x}`),
                      ...t.assetNames.map((x) => `Asset: ${x}`),
                    ];
                    return parts.length ? parts.join(" · ") : t.note ?? "Sin destinos configurados";
                  })()}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
