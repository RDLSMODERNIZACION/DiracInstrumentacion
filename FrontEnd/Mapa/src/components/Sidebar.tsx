import React, { useMemo } from "react";
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
        background: "rgba(255,255,255,0.06)",
        border: "1px solid rgba(255,255,255,0.10)",
        color: "rgba(255,255,255,0.86)",
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

  // ✅ viene de App (para que el mapa sepa qué resaltar)
  activeValveId: string | null;
  setActiveValveId: (id: string | null) => void;

  // ✅ App decide si corresponde mostrar impacto
  showValveImpact: boolean;

  // ✅ NUEVO: modo vista (Todos/Localidades/Cañerías/Barrios)
  viewMode: ViewMode;
  setViewMode: (m: ViewMode) => void;
  viewSelectedId: string | null;
  setViewSelectedId: (id: string | null) => void;

  // ✅ listas para selector de vista (globales)
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

  const TabBtn = ({ id, label }: { id: ZoneTab; label: string }) => (
    <button
      className="btn"
      onClick={() => setZoneTab(id)}
      style={{
        opacity: zoneTab === id ? 1 : 0.7,
        borderColor: zoneTab === id ? "rgba(34,211,238,0.35)" : "rgba(255,255,255,0.10)",
        background: zoneTab === id ? "rgba(34,211,238,0.10)" : "rgba(255,255,255,0.04)",
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
        opacity: viewMode === id ? 1 : 0.7,
        borderColor: viewMode === id ? "rgba(34,211,238,0.35)" : "rgba(255,255,255,0.10)",
        background: viewMode === id ? "rgba(34,211,238,0.10)" : "rgba(255,255,255,0.04)",
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

  return (
    <div className="sidebar">
      {/* Header limpio */}
      <div className="header">
        <div className="brand">
          <div className="brandTitle">Localidades</div>
          <div className="brandSub">
            {mode === "ZONE" && selectedZone ? (
              <>
                <span style={{ fontWeight: 800 }}>{selectedZone.name}</span>{" "}
                <span style={{ color: "var(--muted)" }}>· {selectedZone.id}</span>
              </>
            ) : (
              <span style={{ color: "var(--muted)" }}>Seleccioná una localidad en el mapa</span>
            )}
          </div>
        </div>

        <div className="btnRow">
          <button className="btn" onClick={onReset}>
            Limpiar
          </button>
        </div>
      </div>

      {/* ✅ VISTA / FILTRO (Todos / Localidades / Cañerías / Barrios) */}
      <div className="card">
        <div className="sectionTitle">Vista</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <ModeBtn id="ALL" label="Todos" />
          <ModeBtn id="ZONES" label="Localidades" />
          <ModeBtn id="PIPES" label="Cañerías" />
          <ModeBtn id="BARRIOS" label="Barrios" />
        </div>

        {viewMode !== "ALL" && (
          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 8 }}>
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
                        borderColor: active ? "rgba(34,211,238,0.30)" : undefined,
                        background: active ? "rgba(34,211,238,0.06)" : undefined,
                        cursor: "pointer",
                      }}
                      onClick={() => setViewSelectedId(active ? null : z.id)}
                    >
                      <div className="itemLeft">
                        <span className="dot" style={{ background: "var(--zone)" }} />
                        <div style={{ minWidth: 0 }}>
                          <div className="itemTitle">{z.name}</div>
                          <div className="itemSub">{z.id}</div>
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
                        borderColor: active ? "rgba(34,211,238,0.30)" : undefined,
                        background: active ? "rgba(34,211,238,0.06)" : undefined,
                        cursor: "pointer",
                      }}
                      onClick={() => setViewSelectedId(active ? null : b.id)}
                    >
                      <div className="itemLeft">
                        <span className="dot" style={{ background: "rgba(255,255,255,0.65)" }} />
                        <div style={{ minWidth: 0 }}>
                          <div className="itemTitle">{b.name}</div>
                          <div className="itemSub">
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
                        borderColor: active ? "rgba(34,211,238,0.30)" : undefined,
                        background: active ? "rgba(34,211,238,0.06)" : undefined,
                        cursor: "pointer",
                      }}
                      onClick={() => setViewSelectedId(active ? null : e.id)}
                    >
                      <div className="itemLeft">
                        <span className="dot" style={{ background: edgeColor(e.type) }} />
                        <div style={{ minWidth: 0 }}>
                          <div className="itemTitle">{title}</div>
                          <div className="itemSub">
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
        <div className="card" style={{ marginTop: 10 }}>
          <div className="sectionTitle">Operación</div>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>
            • Click en una localidad para ver activos y conexiones.<br />
            • En válvulas, tocá una fila para ver el impacto real (barrios o cañerías).
          </div>
        </div>
      )}

      {/* Localidad */}
      {mode === "ZONE" && selectedZone && (
        <div className="card" style={{ marginTop: 10 }}>
          <div className="sectionTitle">Localidad</div>

          <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6, flexWrap: "wrap" }}>
            <span className="pill">
              <span className="dot" style={{ background: "var(--zone)" }} /> {selectedZone.id}
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
              <div className="sectionTitle">Válvulas</div>

              <div className="list" style={{ marginTop: 8 }}>
                {locationInventory.valves.map((v) => {
                  const on = valveEnabled[v.id] !== false;
                  const isActive = activeValveId === v.id;

                  return (
                    <div
                      key={v.id}
                      className="item"
                      style={{
                        borderColor: isActive ? "rgba(34,211,238,0.30)" : undefined,
                        background: isActive ? "rgba(34,211,238,0.06)" : undefined,
                      }}
                    >
                      <div
                        className="itemLeft"
                        role="button"
                        onClick={() => setActiveValveId((cur) => (cur === v.id ? null : v.id))}
                        style={{ cursor: "pointer" }}
                        title="Ver impacto"
                      >
                        <span className="dot" style={{ background: dotColor(v.status) }} />
                        <div style={{ minWidth: 0 }}>
                          <div className="itemTitle">{v.name}</div>
                          <div className="itemSub" style={{ opacity: 0.85 }}>
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
                  <div style={{ fontSize: 12, color: "var(--muted)" }}>
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
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.10)",
                  }}
                >
                  <div style={{ fontWeight: 900, fontSize: 12, letterSpacing: 0.4, textTransform: "uppercase" }}>
                    Impacto
                  </div>
                  <div style={{ marginTop: 6, fontWeight: 900, fontSize: 14 }}>
                    {valveImpact.valveName}
                  </div>

                  <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                    {valveImpact.barrioNames.length > 0 && (
                      <div>
                        <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>Barrios</div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                          {valveImpact.barrioNames.map((n) => <Chip key={n} text={n} />)}
                        </div>
                      </div>
                    )}

                    {!!valveImpact.locationNames.length && (
                      <div>
                        <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>Localidades</div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                          {valveImpact.locationNames.map((n) => <Chip key={n} text={n} />)}
                        </div>
                      </div>
                    )}

                    {valveImpact.pipeItems.length > 0 && (
                      <div>
                        <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>Cañerías</div>
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
                                background: "rgba(0,0,0,0.18)",
                                border: "1px solid rgba(255,255,255,0.08)",
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
                                  <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
                                    Requiere: {p.requires.join(", ")}
                                  </div>
                                ) : (
                                  <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
                                    Sin prerequisitos
                                  </div>
                                )}
                              </div>
                              <span
                                className="pill"
                                style={{
                                  background: "rgba(255,255,255,0.06)",
                                  border: "1px solid rgba(255,255,255,0.10)",
                                }}
                              >
                                <span className="dot" style={{ background: edgeColor(p.type) }} /> {p.type}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {valveImpact.note && (
                      <div style={{ fontSize: 12, color: "var(--muted)" }}>
                        Nota: {valveImpact.note}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {!showValveImpact && activeValveId && (
                <div style={{ marginTop: 10, fontSize: 12, color: "var(--muted)" }}>
                  Esta válvula no alimenta barrios ni una cañería hacia otra localidad.
                </div>
              )}
            </div>
          )}

          {/* TAB: TANKS */}
          {zoneTab === "TANKS" && (
            <div style={{ marginTop: 12 }}>
              <div className="sectionTitle">Tanques</div>
              <div className="list">
                {locationInventory.tanks.map((t) => (
                  <div key={t.id} className="item">
                    <div className="itemLeft" role="button">
                      <span className="dot" style={{ background: dotColor(t.status) }} />
                      <div style={{ minWidth: 0 }}>
                        <div className="itemTitle">{t.name}</div>
                        <div className="itemSub">
                          {String(t.meta.nivel_pct ?? "—")} % · {String(t.meta.autonomia_h ?? "—")} h
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                {locationInventory.tanks.length === 0 && (
                  <div style={{ fontSize: 12, color: "var(--muted)" }}>
                    Sin tanques cargados.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB: PUMPS */}
          {zoneTab === "PUMPS" && (
            <div style={{ marginTop: 12 }}>
              <div className="sectionTitle">Bombas</div>
              <div className="list">
                {locationInventory.pumps.map((p) => (
                  <div key={p.id} className="item">
                    <div className="itemLeft" role="button">
                      <span className="dot" style={{ background: dotColor(p.status) }} />
                      <div style={{ minWidth: 0 }}>
                        <div className="itemTitle">{p.name}</div>
                        <div className="itemSub">
                          Estado: {String(p.meta.estado ?? "—")} · Hz: {String(p.meta.hz ?? "—")} · kW:{" "}
                          {String(p.meta.kw ?? "—")}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                {locationInventory.pumps.length === 0 && (
                  <div style={{ fontSize: 12, color: "var(--muted)" }}>
                    Sin bombas cargadas.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB: MANIFOLDS */}
          {zoneTab === "MANIFOLDS" && (
            <div style={{ marginTop: 12 }}>
              <div className="sectionTitle">Manifolds</div>
              <div className="list">
                {locationInventory.manifolds.map((m) => (
                  <div key={m.id} className="item">
                    <div className="itemLeft" role="button">
                      <span className="dot" style={{ background: dotColor(m.status) }} />
                      <div style={{ minWidth: 0 }}>
                        <div className="itemTitle">{m.name}</div>
                        <div className="itemSub">
                          {String(m.meta.presion_psi ?? "—")} psi · {String(m.meta.caudal_m3h ?? "—")} m³/h
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                {locationInventory.manifolds.length === 0 && (
                  <div style={{ fontSize: 12, color: "var(--muted)" }}>
                    Sin manifolds cargados.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB: PIPES */}
          {zoneTab === "PIPES" && (
            <div style={{ marginTop: 12 }}>
              <div className="sectionTitle">Cañerías / Conexiones</div>
              <div className="list">
                {locationInventory.pipes.map((e) => {
                  const from = assetsById.get(e.from);
                  const to = assetsById.get(e.to);
                  return (
                    <div key={e.id} className="item">
                      <div className="itemLeft" role="button">
                        <span className="dot" style={{ background: edgeColor(e.type) }} />
                        <div style={{ minWidth: 0 }}>
                          <div className="itemTitle">
                            {from?.name ?? e.from} → {to?.name ?? e.to}
                          </div>
                          <div className="itemSub">
                            Tipo: {e.type} · {from?.locationId ?? "?"} → {to?.locationId ?? "?"}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {locationInventory.pipes.length === 0 && (
                  <div style={{ fontSize: 12, color: "var(--muted)" }}>
                    Sin cañerías asociadas.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB: BARRIOS */}
          {zoneTab === "BARRIOS" && (
            <div style={{ marginTop: 12 }}>
              <div className="sectionTitle">Barrios</div>
              <div className="list">
                {locationInventory.barrios.map((b) => (
                  <div key={b.id} className="item">
                    <div className="itemLeft" role="button">
                      <span className="dot" style={{ background: "rgba(255,255,255,0.6)" }} />
                      <div style={{ minWidth: 0 }}>
                        <div className="itemTitle">{b.name}</div>
                        <div className="itemSub">Alimentado por: {b.meta.alimentado_por}</div>
                      </div>
                    </div>
                  </div>
                ))}
                {locationInventory.barrios.length === 0 && (
                  <div style={{ fontSize: 12, color: "var(--muted)" }}>
                    Sin barrios cargados.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ASSET */}
      {mode === "ASSET" && selectedAsset && (
        <div className="card" style={{ marginTop: 10 }}>
          <div className="sectionTitle">Activo</div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span className="dot" style={{ background: dotColor(selectedAsset.status) }} />
            <div>
              <div style={{ fontWeight: 900, fontSize: 14 }}>{selectedAsset.name}</div>
              <div style={{ fontSize: 12, color: "var(--muted)" }}>
                {assetTypeLabel(selectedAsset.type)} · {selectedAsset.status} · {selectedAsset.locationId}
              </div>
            </div>
          </div>

          {selectedAsset.type === "VALVE" && (
            <div style={{ marginTop: 12 }}>
              <div className="sectionTitle">Control</div>
              <div
                className={"switch " + (props.valveEnabled[selectedAsset.id] !== false ? "on" : "")}
                onClick={() => onToggleValve(selectedAsset.id)}
                title="Activar / desactivar"
              >
                <div className="switchKnob" />
              </div>

              <div style={{ marginTop: 10, fontSize: 12, color: "var(--muted)" }}>
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
  );
}
