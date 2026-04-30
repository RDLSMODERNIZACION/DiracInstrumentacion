function LegendDot({ color }: { color: string }) {
  return (
    <span
      style={{
        width: 10,
        height: 10,
        borderRadius: 999,
        display: "inline-block",
        background: color,
        boxShadow: "0 0 0 2px rgba(255,255,255,0.12)",
        flex: "0 0 auto",
      }}
    />
  );
}

function LegendLine({
  color,
  width,
  dash,
}: {
  color: string;
  width: number;
  dash?: boolean;
}) {
  return (
    <span
      style={{
        width: 38,
        height: 0,
        borderTop: `${width}px ${dash ? "dashed" : "solid"} ${color}`,
        borderRadius: 999,
        display: "inline-block",
        flex: "0 0 auto",
      }}
    />
  );
}

export default function MapLegendOverlay({
  simActive,
  showPressureNodes,
}: {
  simActive: boolean;
  showPressureNodes: boolean;
}) {
  return (
    <div
      style={{
        position: "absolute",
        left: 16,
        bottom: 18,
        zIndex: 1000,
        width: 280,
        padding: 12,
        borderRadius: 16,
        background: "rgba(15,23,42,0.82)",
        color: "#fff",
        border: "1px solid rgba(255,255,255,0.14)",
        boxShadow: "0 14px 36px rgba(0,0,0,0.35)",
        backdropFilter: "blur(9px)",
        fontSize: 12,
      }}
    >
      <div
        style={{
          fontWeight: 900,
          fontSize: 12,
          letterSpacing: 0.4,
          textTransform: "uppercase",
          marginBottom: 8,
        }}
      >
        Referencias hidráulicas
      </div>

      <div style={{ display: "grid", gap: 5 }}>
        <div style={{ fontWeight: 800, opacity: 0.8 }}>Tipo de cañería</div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <LegendLine color="#2563eb" width={4} />
          <span>Impulsión</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <LegendLine color="#16a34a" width={4} dash />
          <span>Distribución</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <LegendLine color="#14b8a6" width={3} dash />
          <span>Ramal / secundaria</span>
        </div>

        <div style={{ height: 1, background: "rgba(255,255,255,0.14)", margin: "6px 0" }} />

        <div style={{ fontWeight: 800, opacity: 0.8 }}>Diámetro</div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <LegendLine color="#dbeafe" width={2} />
          <span>Menor diámetro</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <LegendLine color="#dbeafe" width={7} />
          <span>Mayor diámetro</span>
        </div>

        {simActive && (
          <>
            <div style={{ height: 1, background: "rgba(255,255,255,0.14)", margin: "6px 0" }} />

            <div style={{ fontWeight: 800, opacity: 0.8 }}>
              Presión estimada {showPressureNodes ? "(puntos activos)" : ""}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <LegendDot color="#ef4444" />
                <span>&lt; 0.5 bar</span>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <LegendDot color="#f97316" />
                <span>0.5 - 1.2</span>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <LegendDot color="#facc15" />
                <span>1.2 - 2.0</span>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <LegendDot color="#22c55e" />
                <span>2.0 - 5.0</span>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <LegendDot color="#38bdf8" />
                <span>5.0 - 6.5</span>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <LegendDot color="#a855f7" />
                <span>&gt; 6.5</span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
