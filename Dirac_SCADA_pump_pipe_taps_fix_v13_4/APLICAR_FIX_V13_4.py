from pathlib import Path
import re

repo = Path.cwd()
base = repo / "FrontEnd/App_2/src/features/infra-diagram"
infra = base / "InfraDiagram.tsx"
edge = base / "components/edges/EditableEdge.tsx"

for f in [infra, edge]:
    if not f.exists():
        raise SystemExit(f"No encuentro {f}. Ejecutá este parche desde la raíz de DiracInstrumentacion.")

# ============================================================
# EditableEdge: highlight clickable directo
# ============================================================
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

# Remove prior passive highlight if exists
e = re.sub(
    r'\s*\{tapConnectMode && \(\s*<path\s*data-role="pump-tap-connect-highlight"[\s\S]*?</path>|\s*\{tapConnectMode && \([\s\S]*?data-role="pump-tap-connect-highlight"[\s\S]*?/?>\s*\)\}',
    "",
    e,
    count=1
)

marker = "      {/* hit test */}"
idx = e.find(marker)
if idx < 0:
    raise SystemExit("No encontré el hit-test de EditableEdge.")

clickable = '''      {tapConnectMode && onTapPipeClick && (
        <path
          data-role="pump-tap-connect-highlight"
          d={geom.d}
          fill="none"
          stroke="#38bdf8"
          strokeWidth={18}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.32}
          style={{
            pointerEvents: "stroke",
            cursor: "crosshair",
          }}
          onPointerDown={(ev) => {
            const p = svgPointFromEvent(ev);
            console.log("[PUMP-TAP][HIGHLIGHT_POINTER]", {
              edgeId: id,
              point: p,
            });

            if (!p) return;

            ev.preventDefault();
            ev.stopPropagation();

            console.log("[PUMP-TAP][HIGHLIGHT_DISPATCH]", {
              edgeId: id,
              x: p.x,
              y: p.y,
            });

            onTapPipeClick(id, p.x, p.y);
          }}
        />
      )}

'''

# insert only if not already direct handler
if "[PUMP-TAP][HIGHLIGHT_POINTER]" not in e:
    e = e[:idx] + clickable + e[idx:]

# make all normal visual layers noninteractive
for old, new in [
    ('opacity={0.55}\n      />', 'opacity={0.55}\n        style={{ pointerEvents: "none" }}\n      />'),
    ('opacity={0.95}\n      />', 'opacity={0.95}\n        style={{ pointerEvents: "none" }}\n      />'),
    ('opacity={0.9}\n      />', 'opacity={0.9}\n        style={{ pointerEvents: "none" }}\n      />'),
]:
    if old in e:
        e = e.replace(old, new, 1)

edge.write_text(e, encoding="utf-8")

# ============================================================
# InfraDiagram: logs que sí coinciden con tu versión compacta
# ============================================================
i = infra.read_text(encoding="utf-8-sig")

# Compact handler seen in user's file
old_handler = '''  const handlePumpTapPipeClick = useCallback(async
(edgeId:number,x:number,y:number) => {
    if(!pumpTapFrom) return; const
pumpNode=nodesById[pumpTapFrom]; if(!pumpNode||pumpNode.type!=="pump")return;'''

# Actual file may be single line without newline after async.
if "[PUMP-TAP][PIPE_HANDLER]" not in i:
    i = i.replace(
        "const handlePumpTapPipeClick = useCallback(async(edgeId:number,x:number,y:number) => {\n    if(!pumpTapFrom) return;",
        'const handlePumpTapPipeClick = useCallback(async(edgeId:number,x:number,y:number) => {\n    console.log("[PUMP-TAP][PIPE_HANDLER]", {pumpTapFrom, edgeId, x, y, editMode, connectMode});\n    if(!pumpTapFrom) { console.warn("[PUMP-TAP][ABORT_NO_PUMP]"); return; }'
    )

# Compact pump click from user's exact output
if "[PUMP-TAP][PUMP_SELECT]" not in i:
    i = i.replace(
        "if(editMode&&connectMode){ setPumpTapFrom((prev)=>prev===n.id?null:n.id); setConnectFrom(null); return; }",
        'if(editMode&&connectMode){ console.log("[PUMP-TAP][PUMP_SELECT]", {id:n.id, pumpTapFrom}); setPumpTapFrom((prev)=>prev===n.id?null:n.id); setConnectFrom(null); return; }'
    )

# Add a state watcher if absent
if "[PUMP-TAP][STATE]" not in i:
    anchor = "  const pumpTapByEdge = useMemo(() => {"
    pos = i.find(anchor)
    if pos >= 0:
        block = '''  useEffect(() => {
    console.log("[PUMP-TAP][STATE]", {
      editMode,
      connectMode,
      pumpTapFrom,
      tapCount: pumpPipeTaps.length,
    });
  }, [editMode, connectMode, pumpTapFrom, pumpPipeTaps.length]);

'''
        i = i[:pos] + block + i[pos:]

infra.write_text(i, encoding="utf-8")

print("FIX V13.4 aplicado correctamente.")
