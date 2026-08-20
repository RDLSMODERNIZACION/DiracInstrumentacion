from pathlib import Path
import re

repo = Path.cwd()
base = repo / "FrontEnd/App_2/src/features/infra-diagram"
infra = base / "InfraDiagram.tsx"
edge = base / "components/edges/EditableEdge.tsx"

for f in [infra, edge]:
    if not f.exists():
        raise SystemExit(f"No encuentro {f}. Ejecutá este parche desde la raíz de DiracInstrumentacion.")

# =========================
# EditableEdge
# =========================
e = edge.read_text(encoding="utf-8-sig")

# Props
if "tapConnectMode?: boolean;" not in e:
    e = e.replace(
        "  onSelect?: (edgeId: number) => void;\n};",
        "  onSelect?: (edgeId: number) => void;\n"
        "  tapConnectMode?: boolean;\n"
        "  onTapPipeClick?: (edgeId: number, x: number, y: number) => void;\n};"
    )

if "tapConnectMode," not in e:
    e = e.replace(
        "  selected,\n  onSelect,\n}: Props)",
        "  selected,\n  onSelect,\n  tapConnectMode,\n  onTapPipeClick,\n}: Props)"
    )

# Larger click zone only while connecting a pump.
e = re.sub(
    r"const HIT_STROKE = \d+;",
    'const HIT_STROKE = tapConnectMode ? 42 : 18;',
    e
)

# Ensure hit path cursor uses crosshair.
e = e.replace(
    'style={{ pointerEvents: "stroke", cursor: editable ? "pointer" : "default" }}',
    'style={{ pointerEvents: "stroke", cursor: tapConnectMode ? "crosshair" : editable ? "pointer" : "default" }}'
)
e = e.replace(
    'style={{ pointerEvents: "stroke", cursor: tapConnectMode ? "crosshair" : editable ? "pointer" : "default" }}',
    'style={{ pointerEvents: "stroke", cursor: tapConnectMode ? "crosshair" : editable ? "pointer" : "default" }}'
)

# Make visible base pipe layers non interactive.
for old, new in [
    ('opacity={0.55}\n      />', 'opacity={0.55}\n        style={{ pointerEvents: "none" }}\n      />'),
    ('opacity={0.95}\n      />', 'opacity={0.95}\n        style={{ pointerEvents: "none" }}\n      />'),
    ('opacity={0.9}\n      />', 'opacity={0.9}\n        style={{ pointerEvents: "none" }}\n      />'),
]:
    if old in e:
        e = e.replace(old, new, 1)

# Add a clear temporary "connectable pipe" highlight BEFORE hit-test.
if "pump-tap-connect-highlight" not in e:
    marker = "      {/* hit test */}"
    idx = e.find(marker)
    if idx < 0:
        raise SystemExit("No encontré el hit-test de la cañería.")

    highlight = '''      {tapConnectMode && (
        <path
          data-role="pump-tap-connect-highlight"
          d={geom.d}
          fill="none"
          stroke="#38bdf8"
          strokeWidth={14}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.24}
          style={{ pointerEvents: "none" }}
        />
      )}

'''
    e = e[:idx] + highlight + e[idx:]

# Robust tap click handler on hit path.
hit_idx = e.find("      {/* hit test */}")
handler_start = e.find("onPointerDown={(e) => {", hit_idx)
if handler_start < 0:
    raise SystemExit("No encontré onPointerDown del hit-test.")

handler_end = e.find("        }}", handler_start)
if handler_end < 0:
    raise SystemExit("No encontré cierre del onPointerDown del hit-test.")
handler_end += len("        }}")

new_handler = '''onPointerDown={(e) => {
          if (tapConnectMode && onTapPipeClick) {
            const p = svgPointFromEvent(e);
            if (p) {
              e.preventDefault();
              e.stopPropagation();
              onTapPipeClick(id, p.x, p.y);
            }
            return;
          }

          if (!editable) return;

          e.preventDefault();
          e.stopPropagation();
          onSelect?.(id);

          if ((e as any).shiftKey) {
            addPoint(e, "hit:pointerdown");
          }
        }}'''

e = e[:handler_start] + new_handler + e[handler_end:]

# Selected overlay should never eat pointer events.
sel = e.find("{selected && (")
if sel >= 0:
    tail = e[sel:]
    tail = tail.replace(
        'opacity={0.22}\n          />',
        'opacity={0.22}\n            style={{ pointerEvents: "none" }}\n          />',
        1
    )
    tail = tail.replace(
        'opacity={0.95}\n          />',
        'opacity={0.95}\n            style={{ pointerEvents: "none" }}\n          />',
        1
    )
    e = e[:sel] + tail

edge.write_text(e, encoding="utf-8")

# =========================
# InfraDiagram
# =========================
i = infra.read_text(encoding="utf-8-sig")

if "handlePumpTapPipeClick" not in i or "pumpTapFrom" not in i:
    raise SystemExit("Primero aplicá V13: falta pumpTapFrom o handlePumpTapPipeClick.")

if "tapConnectMode={editMode && connectMode && !!pumpTapFrom}" not in i:
    needle = "                    knots={e.knots ?? []}\n"
    if needle in i:
        i = i.replace(
            needle,
            needle
            + "                    tapConnectMode={editMode && connectMode && !!pumpTapFrom}\n"
            + "                    onTapPipeClick={handlePumpTapPipeClick}\n",
            1
        )
    else:
        raise SystemExit("No encontré la llamada EditableEdge para insertar props.")

# Simplify user prompt: inject/extract with a small confirm instead of numeric prompt.
old = '''      const raw = window.prompt(
        "Tipo de conexión:\\n1 = INYECTA a la cañería\\n2 = EXTRAE de la cañería",
        "1"
      );
      if (raw == null) return;

      const mode: PumpPipeTapMode =
        String(raw).trim() === "2" ? "extract" : "inject";'''

new = '''      const inject = window.confirm(
        "Aceptar = INYECTA a la cañería\\nCancelar = EXTRAE de la cañería"
      );

      const mode: PumpPipeTapMode = inject ? "inject" : "extract";'''

if old in i:
    i = i.replace(old, new, 1)

infra.write_text(i, encoding="utf-8")

print("FIX V13.2 aplicado correctamente.")
