from pathlib import Path

repo = Path.cwd()
infra = repo / "FrontEnd/App_2/src/features/infra-diagram/InfraDiagram.tsx"
analyzer = repo / "FrontEnd/App_2/src/features/infra-diagram/components/nodes/NetworkAnalyzerNodeView.tsx"

for f in [infra, analyzer]:
    if not f.exists():
        raise SystemExit(f"No encuentro {f}. Ejecutá desde la raíz de DiracInstrumentacion.")

i = infra.read_text(encoding="utf-8-sig")

# 1) Eliminar completamente el bloque visual de localidades
start_token = "                {locationGroups.map((g) => ("
start = i.find(start_token)

if start >= 0:
    end_token = "                {edgesForRender.map((e) => ("
    end = i.find(end_token, start)
    if end < 0:
        raise SystemExit("Encontré locationGroups pero no edgesForRender.")
    replacement = (
        "                {/* Localidades visuales eliminadas: "
        "sin fondos ni títulos. */}\n\n"
    )
    i = i[:start] + replacement + i[end:]

# 2) Renderizar network_analyzer al final entre los nodos
old = "                {visibleNodes.map((n) =>"
new = '''                {[...visibleNodes]
                  .sort((a, b) => {
                    const za = a.type === "network_analyzer" ? 1 : 0;
                    const zb = b.type === "network_analyzer" ? 1 : 0;
                    return za - zb;
                  })
                  .map((n) =>'''

if old in i:
    i = i.replace(old, new, 1)

infra.write_text(i, encoding="utf-8")

a = analyzer.read_text(encoding="utf-8-sig")

old_panel = '''          <rect
            x={panelX}
            y={panelY}
            width={PANEL_W}
            height={PANEL_H}
            rx={14}
            fill="#ffffff"
            stroke="#cbd5e1"
            strokeWidth={1.4}
          />'''

new_panel = '''          <defs>
            <filter
              id={`electric-panel-shadow-${n.id}`}
              x="-20%"
              y="-20%"
              width="140%"
              height="140%"
            >
              <feDropShadow
                dx="0"
                dy="4"
                stdDeviation="5"
                floodColor="#0f172a"
                floodOpacity="0.28"
              />
            </filter>
          </defs>

          <rect
            x={panelX}
            y={panelY}
            width={PANEL_W}
            height={PANEL_H}
            rx={14}
            fill="#ffffff"
            fillOpacity={1}
            stroke="#94a3b8"
            strokeWidth={1.6}
            filter={`url(#electric-panel-shadow-${n.id})`}
          />'''

if old_panel in a:
    a = a.replace(old_panel, new_panel, 1)

marker = '''{expanded && !enabled && (
        <g>'''

if marker in a and 'data-role="electric-detail-hitarea"' not in a:
    replacement = '''{expanded && !enabled && (
        <g>
          <rect
            data-role="electric-detail-hitarea"
            x={panelX}
            y={panelY}
            width={PANEL_W}
            height={PANEL_H}
            rx={14}
            fill="#ffffff"
            fillOpacity={0.001}
            style={{ pointerEvents: "all" }}
            onMouseDown={(e) => e.stopPropagation()}
          />'''
    a = a.replace(marker, replacement, 1)

analyzer.write_text(a, encoding="utf-8")

print("V16.3 aplicado correctamente.")
