from pathlib import Path
import shutil
import re

repo = Path.cwd()
backend_dir = repo / "Backend/app/routes/infraestructura"
front = repo / "FrontEnd/App_2/src/features/infra-diagram"

layout = backend_dir / "layout.py"
init_py = backend_dir / "__init__.py"
infra = front / "InfraDiagram.tsx"
tank = front / "components/nodes/TankNodeView.tsx"

for f in [layout, init_py, infra, tank]:
    if not f.exists():
        raise SystemExit(f"No encuentro {f}. Ejecutá desde la raíz de DiracInstrumentacion.")

here = Path(__file__).resolve().parent / "archivos"
shutil.copy2(here / "node_servicio.py", backend_dir / "node_servicio.py")
shutil.copy2(here / "nodeServicio.ts", front / "services/nodeServicio.ts")

# ---------------- backend router ----------------
s = init_py.read_text(encoding="utf-8-sig")
if "node_servicio_router" not in s:
    s = s.replace(
        "from .pump_taps import router as pump_taps_router",
        "from .pump_taps import router as pump_taps_router\nfrom .node_servicio import router as node_servicio_router"
    )
    s = s.replace(
        "router.include_router(pump_taps_router)",
        "router.include_router(pump_taps_router)\nrouter.include_router(node_servicio_router)"
    )
init_py.write_text(s, encoding="utf-8")

# ---------------- backend layout servicio ----------------
b = layout.read_text(encoding="utf-8-sig")

needle = "CASE WHEN c.type = 'pump' THEN p.orientacion ELSE NULL END AS orientacion,"
if needle in b and "AS servicio," not in b[b.find(needle):b.find("FROM public.v_layout_combined", b.find(needle))]:
    b = b.replace(
        needle,
        needle + '''
                      CASE
                        WHEN c.type = 'tank' THEN t.servicio
                        WHEN c.type = 'pump' THEN p.servicio
                        WHEN c.type = 'manifold' THEN m.servicio
                        ELSE 'agua'
                      END::text AS servicio,''',
        1
    )

b = b.replace(
    '''                      NULL::text AS orientacion,
                      lna.meta AS meta,''',
    '''                      NULL::text AS orientacion,
                      na.servicio::text AS servicio,
                      lna.meta AS meta,''',
    1
)

b = b.replace(
    '''                    t.categoria::text AS categoria,
                    NULL::text AS orientacion,
                    l.id::bigint AS location_id,''',
    '''                    t.categoria::text AS categoria,
                    NULL::text AS orientacion,
                    t.servicio::text AS servicio,
                    l.id::bigint AS location_id,''',
    1
)

b = b.replace(
    '''                    NULL::text AS categoria,
                    p.orientacion::text AS orientacion,
                    l.id::bigint AS location_id,''',
    '''                    NULL::text AS categoria,
                    p.orientacion::text AS orientacion,
                    p.servicio::text AS servicio,
                    l.id::bigint AS location_id,''',
    1
)

# valve
b = b.replace(
    '''                    NULL::text AS orientacion,
                    NULL::text AS categoria,
                    l.id::bigint AS location_id,''',
    '''                    NULL::text AS orientacion,
                    NULL::text AS categoria,
                    NULL::text AS servicio,
                    l.id::bigint AS location_id,''',
    1
)

# manifold
manifold_old = '''                    NULL::text AS orientacion,
                    NULL::text AS categoria,
                    l.id::bigint AS location_id,
                    l.name::text AS location_name,
                    NULL::jsonb AS meta,
                    COALESCE(ms.signals, '{}'::jsonb) AS signals'''
if manifold_old in b:
    b = b.replace(
        manifold_old,
        '''                    NULL::text AS orientacion,
                    NULL::text AS categoria,
                    m.servicio::text AS servicio,
                    l.id::bigint AS location_id,
                    l.name::text AS location_name,
                    NULL::jsonb AS meta,
                    COALESCE(ms.signals, '{}'::jsonb) AS signals''',
        1
    )

# network analyzer company branch
na_old = '''                    NULL::text AS categoria,
                    NULL::text AS orientacion,
                    l.id::bigint AS location_id,'''
if na_old in b:
    # use last occurrence so it targets analyzer rather than another CTE
    idx = b.rfind(na_old)
    b = b[:idx] + b[idx:].replace(
        na_old,
        '''                    NULL::text AS categoria,
                    NULL::text AS orientacion,
                    na.servicio::text AS servicio,
                    l.id::bigint AS location_id,''',
        1
    )

b = b.replace(
    "categoria,orientacion,location_id,location_name,meta,signals",
    "categoria,orientacion,servicio,location_id,location_name,meta,signals"
)

layout.write_text(b, encoding="utf-8")

# ---------------- Tank visual ----------------
t = tank.read_text(encoding="utf-8-sig")

t = t.replace(
    "categoria?: TankCategory | null;",
    'categoria?: TankCategory | null;\n    servicio?: "agua" | "cargaderos" | "cloacas" | null;'
)

category_block = '''  const category: TankCategory =
    (n as any).categoria === "pozo" ? "pozo" : "tanque";'''

if category_block in t and "const servicio =" not in t:
    t = t.replace(
        category_block,
        category_block + '''

  const servicio =
    (n as any).servicio === "cargaderos"
      ? "cargaderos"
      : (n as any).servicio === "cloacas"
      ? "cloacas"
      : "agua";

  const servicioLabel =
    servicio === "cargaderos"
      ? "CARGADEROS"
      : servicio === "cloacas"
      ? "CLOACAS"
      : "AGUA";

  const isCloacas = servicio === "cloacas";'''
    )

t = t.replace(
    'fill={`url(#wellSteel-${n.id})`}',
    'fill={isCloacas ? "#dcfce7" : `url(#wellSteel-${n.id})`}'
)
t = t.replace(
    'fill={`url(#tankSteel-${n.id})`}',
    'fill={isCloacas ? "#dcfce7" : `url(#tankSteel-${n.id})`}'
)
t = t.replace(
    'fill="#60a5fa"',
    'fill={isCloacas ? "#22c55e" : "#60a5fa"}'
)
t = t.replace(
    'fill="#2563eb"',
    'fill={isCloacas ? "#15803d" : "#2563eb"}'
)

pozo_marker = '''        </text>

        {/* Cabezal */}'''
if pozo_marker in t and "POZO ·" not in t:
    t = t.replace(
        pozo_marker,
        '''        </text>

        <text
          x={W / 2}
          y={43}
          textAnchor="middle"
          fill={isCloacas ? "#15803d" : "#64748b"}
          style={{ fontSize: 10, fontWeight: 900, letterSpacing: 0.6, pointerEvents: "none" }}
        >
          {`POZO · ${servicioLabel}`}
        </text>

        {/* Cabezal */}''',
        1
    )

normal_marker = '''      </text>

      <rect
        x={bodyX}'''
if normal_marker in t and "TANQUE ·" not in t:
    idx = t.rfind(normal_marker)
    repl = '''      </text>

      <text
        x={W / 2}
        y={40}
        textAnchor="middle"
        fill={isCloacas ? "#15803d" : "#64748b"}
        style={{ fontSize: 10, fontWeight: 900, letterSpacing: 0.6, pointerEvents: "none" }}
      >
        {`TANQUE · ${servicioLabel}`}
      </text>

      <rect
        x={bodyX}'''
    t = t[:idx] + t[idx:].replace(normal_marker, repl, 1)

tank.write_text(t, encoding="utf-8")

# ---------------- InfraDiagram ----------------
i = infra.read_text(encoding="utf-8-sig")

if 'from "./services/nodeServicio"' not in i:
    anchor = 'import { getPumpPipeTaps, savePumpPipeTap'
    pos = i.find(anchor)
    if pos < 0:
        raise SystemExit("No encontré import pumpTaps.")
    end = i.find("\n", pos)
    i = i[:end] + '\nimport { saveNodeServicio, type ServicioSCADA } from "./services/nodeServicio";' + i[end:]

state_anchor = '  const [connectMode, setConnectMode] = useState(false);'
if "activeServicio" not in i:
    i = i.replace(
        state_anchor,
        state_anchor + '''
  const [activeServicio, setActiveServicio] = useState<"todos" | ServicioSCADA>("todos");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);'''
    )

map_anchor = '      orientacion: (n as any).orientacion ?? null,'
if map_anchor in i and 'servicio: (n as any).servicio' not in i:
    i = i.replace(
        map_anchor,
        map_anchor + '\n      servicio: (n as any).servicio ?? "agua",'
    )

old_visible = '''  const visibleNodes = useMemo(
    () => nodes.filter((n) => n.type !== "valve"),
    [nodes]
  );'''

new_visible = '''  const visibleNodes = useMemo(
    () =>
      nodes.filter((n) => {
        if (n.type === "valve") return false;
        if (activeServicio === "todos") return true;
        return ((n as any).servicio ?? "agua") === activeServicio;
      }),
    [nodes, activeServicio]
  );

  const visibleNodeIds = useMemo(
    () => new Set(visibleNodes.map((n) => n.id)),
    [visibleNodes]
  );

  const selectedNode = selectedNodeId ? nodesById[selectedNodeId] : null;'''

if old_visible in i:
    i = i.replace(old_visible, new_visible, 1)
elif "const visibleNodeIds" not in i:
    raise SystemExit("No encontré visibleNodes.")

i = i.replace(
    '{edgesForRender.map((e) => (',
    '{edgesForRender.filter((e) => visibleNodeIds.has(e.a) && visibleNodeIds.has(e.b)).map((e) => (',
    1
)

i = i.replace(
    'pump={nodesById[tap.pump_node_id]}',
    'pump={visibleNodeIds.has(tap.pump_node_id) ? nodesById[tap.pump_node_id] : undefined}'
)

controls_marker = '        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>'
if controls_marker in i and 'Cargaderos de agua' not in i:
    tabs = '''        <div
          style={{
            display: "flex",
            gap: 6,
            marginLeft: 14,
            padding: 3,
            borderRadius: 10,
            background: "#eef2f7",
          }}
        >
          {([
            ["todos", "Todos"],
            ["agua", "Agua"],
            ["cargaderos", "Cargaderos de agua"],
            ["cloacas", "Cloacas"],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              onClick={() => {
                setActiveServicio(id);
                setSelectedNodeId(null);
              }}
              style={{
                padding: "5px 10px",
                borderRadius: 8,
                border: "none",
                background: activeServicio === id ? "#0f172a" : "transparent",
                color: activeServicio === id ? "#ffffff" : "#475569",
                fontWeight: 800,
                fontSize: 11,
                cursor: "pointer",
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {editMode && selectedNode && ["tank", "pump"].includes(selectedNode.type) && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: "#64748b" }}>
              Grupo:
            </span>
            <select
              value={((selectedNode as any).servicio ?? "agua") as ServicioSCADA}
              onChange={async (e) => {
                const servicio = e.target.value as ServicioSCADA;
                try {
                  await saveNodeServicio(selectedNode.id, servicio);
                  setNodes((prev) =>
                    prev.map((node) =>
                      node.id === selectedNode.id
                        ? ({ ...node, servicio } as any)
                        : node
                    )
                  );
                } catch (err: any) {
                  console.error(err);
                  alert(err?.message || "No se pudo cambiar el grupo");
                }
              }}
              style={{
                height: 28,
                borderRadius: 7,
                border: "1px solid #cbd5e1",
                background: "#ffffff",
                color: "#0f172a",
                fontSize: 11,
                fontWeight: 800,
                padding: "0 8px",
              }}
            >
              <option value="agua">Agua</option>
              <option value="cargaderos">Cargaderos de agua</option>
              <option value="cloacas">Cloacas</option>
            </select>
          </div>
        )}

'''
    i = i.replace(controls_marker, tabs + controls_marker, 1)

# Replace first two standard node click handlers (tank + pump)
pattern = r'onClick=\{\(\) => \(!editMode && !connectMode \? maybeOpenOps\(n\) : undefined\)\}'
matches = list(re.finditer(pattern, i))
replacement = '''onClick={() => {
                        if (editMode && !connectMode) {
                          setSelectedNodeId(n.id);
                          return;
                        }
                        if (!editMode && !connectMode) maybeOpenOps(n);
                      }}'''
for m in reversed(matches[:2]):
    i = i[:m.start()] + replacement + i[m.end():]

# clear selected node when leaving edit
toggle_idx = i.find("const toggleEdit")
if toggle_idx >= 0:
    seg_end = i.find("  }, []);", toggle_idx)
    if seg_end > toggle_idx:
        seg = i[toggle_idx:seg_end]
        if "setSelectedNodeId(null);" not in seg:
            seg = seg.replace(
                "setSelectedEdgeId(null);",
                "setSelectedEdgeId(null);\n        setSelectedNodeId(null);"
            )
            i = i[:toggle_idx] + seg + i[seg_end:]

infra.write_text(i, encoding="utf-8")

print("V17 aplicado correctamente.")
