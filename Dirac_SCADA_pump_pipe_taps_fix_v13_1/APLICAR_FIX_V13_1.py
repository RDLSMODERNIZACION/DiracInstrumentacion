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

e = re.sub(r"const HIT_STROKE = \d+;", "const HIT_STROKE = 30;", e)

e = e.replace(
    'style={{ pointerEvents: "stroke", cursor: editable ? "pointer" : "default" }}',
    'style={{ pointerEvents: "stroke", cursor: tapConnectMode ? "crosshair" : editable ? "pointer" : "default" }}'
)

hit_marker = "      {/* hit test */}\n      <path"
hit_start = e.find(hit_marker)
if hit_start < 0:
    raise SystemExit("No encontré el hit-test de EditableEdge.")

handler_start = e.find("onPointerDown={(e) => {", hit_start)
handler_end = e.find("        }}", handler_start)
if handler_start < 0 or handler_end < 0:
    raise SystemExit("No encontré onPointerDown del hit-test.")
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

# Prevent visible paths from swallowing pointer events.
# Base outer/body/highlight
repls = [
    ('opacity={0.55}\n      />', 'opacity={0.55}\n        style={{ pointerEvents: "none" }}\n      />'),
    ('opacity={0.95}\n      />', 'opacity={0.95}\n        style={{ pointerEvents: "none" }}\n      />'),
    ('opacity={0.9}\n      />', 'opacity={0.9}\n        style={{ pointerEvents: "none" }}\n      />'),
]
for old, new in repls:
    if old in e:
        e = e.replace(old, new, 1)

# Selection overlay rendered after hit test
sel = e.find("{selected && (")
if sel >= 0:
    tail = e[sel:]
    if 'style={{ pointerEvents: "none" }}' not in tail:
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
    raise SystemExit("Primero aplicá V13: falta handlePumpTapPipeClick o pumpTapFrom en InfraDiagram.")

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

infra.write_text(i, encoding="utf-8")

print("FIX V13.1 aplicado correctamente.")
