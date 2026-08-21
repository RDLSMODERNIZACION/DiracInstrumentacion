from pathlib import Path
import re, shutil

repo = Path.cwd()
base = repo / "FrontEnd/App_2/src/features/infra-diagram"
infra = base / "InfraDiagram.tsx"
pump = base / "components/nodes/PumpNodeView.tsx"
edge = base / "components/edges/EditableEdge.tsx"
for f in [infra,pump,edge]:
    if not f.exists():
        raise SystemExit(f"No encuentro {f}. Ejecutá desde la raíz de DiracInstrumentacion.")
here = Path(__file__).resolve().parent
shutil.copy2(here/"reemplazos/PumpNodeView.tsx", pump)

i = infra.read_text(encoding="utf-8-sig")
# remove old global event listener and state debug
start = i.find('  useEffect(() => {\n    const onPumpTapSelect = (ev: Event) => {')
if start >= 0:
    end = i.find('  }, [editMode, connectMode]);', start)
    if end >= 0:
        end += len('  }, [editMode, connectMode]);')
        i = i[:start] + i[end:]
start = i.find('  useEffect(() => {\n    console.log("[PUMP-TAP][STATE]"')
if start >= 0:
    end = i.find('  }, [editMode, connectMode, pumpTapFrom, pumpPipeTaps.length]);', start)
    if end >= 0:
        end += len('  }, [editMode, connectMode, pumpTapFrom, pumpPipeTaps.length]);')
        i = i[:start] + i[end:]
# handlers
hs = i.find('  const handlePumpTapSelect = useCallback')
he = i.find('  const toggleEdit = useCallback', hs)
if hs < 0 or he < 0:
    raise SystemExit('No encontré handlers pump tap.')
handlers = '''  const handlePumpTapSelect = useCallback((nodeId: string) => {
    if (!editMode || !connectMode) return;
    setPumpTapFrom((prev) => (prev === nodeId ? null : nodeId));
    setConnectFrom(null);
    setMouseSvg(null);
    setSelectedEdgeId(null);
  }, [editMode, connectMode]);

  const handlePumpTapPipeClick = useCallback(async (edgeId: number, x: number, y: number) => {
    if (!pumpTapFrom) return;
    const pumpNode = nodesById[pumpTapFrom];
    if (!pumpNode || pumpNode.type !== "pump") return;

    const inject = window.confirm("Aceptar = INYECTA a la cañería\\nCancelar = EXTRAE de la cañería");
    const mode: PumpPipeTapMode = inject ? "inject" : "extract";
    const pumpId = Number(String(pumpNode.id).split(":").pop());
    if (!Number.isFinite(pumpId)) return;

    try {
      await savePumpPipeTap({ pump_id: pumpId, edge_id: edgeId, mode, x, y, t: 0.5 });
      await refreshPumpPipeTaps();
      setPumpTapFrom(null);
      setConnectFrom(null);
      setMouseSvg(null);
      setSelectedEdgeId(null);
    } catch (err: any) {
      console.error(err);
      alert(err?.message || "No se pudo guardar la conexión bomba-cañería");
    }
  }, [pumpTapFrom, nodesById, refreshPumpPipeTaps]);

'''
i = i[:hs] + handlers + i[he:]
# tank tag cleanup
ts=i.find('<TankNodeView'); te=i.find('/>',ts)
if ts>=0 and te>ts:
    tag=i[ts:te]
    tag=re.sub(r'\n\s*tapSelected=\{pumpTapFrom === n\.id\}','',tag)
    tag=re.sub(r'\n\s*onTapSelect=\{\(\) => handlePumpTapSelect\(n\.id\)\}','',tag)
    tag=re.sub(r'onClick=\{\(\) => \{[\s\S]*?\}\}', 'onClick={() => (!editMode && !connectMode ? maybeOpenOps(n) : undefined)}', tag, count=1)
    i=i[:ts]+tag+i[te:]
# pump tag clean
ps=i.find('<PumpNodeView'); pe=i.find('/>',ps)
if ps<0 or pe<0: raise SystemExit('No encontré PumpNodeView.')
tag=i[ps:pe]
tag=re.sub(r'\n\s*tapConnectMode=\{[^\n]+\}','',tag)
tag=re.sub(r'\n\s*tapSelected=\{[^\n]+\}','',tag)
tag=re.sub(r'\n\s*onTapSelect=\{[^\n]+\}','',tag)
tag=tag.replace('enabled={editMode}', 'enabled={editMode && !connectMode}')
if 'enabled={editMode && !connectMode}' in tag:
    tag=tag.replace('enabled={editMode && !connectMode}', 'enabled={editMode && !connectMode}\n                      tapConnectMode={editMode && connectMode}\n                      tapSelected={pumpTapFrom === n.id}\n                      onTapSelect={handlePumpTapSelect}')
tag=re.sub(r'onClick=\{\(\) => \{[\s\S]*?\}\}', 'onClick={() => (!editMode && !connectMode ? maybeOpenOps(n) : undefined)}', tag, count=1)
i=i[:ps]+tag+i[pe:]
# hide pump ports in legacy connector
i=i.replace('visibleNodes.map((n) => {\n                    const { inPorts, outPorts } = buildPorts(n);', 'visibleNodes.filter((n) => n.type !== "pump").map((n) => {\n                    const { inPorts, outPorts } = buildPorts(n);',1)
# add final tap links if absent
if '{pumpPipeTaps.map((tap)' not in i:
    marker='                {visibleNodes.map((n) =>'
    idx=i.find(marker)
    if idx<0: raise SystemExit('No encontré visibleNodes render.')
    render='''                {pumpPipeTaps.map((tap) => (\n                  <PumpPipeTapView\n                    key={`pump-tap-${tap.id}`}\n                    tap={tap}\n                    pump={nodesById[tap.pump_node_id]}\n                    visiblePoint={editMode && connectMode}\n                  />\n                ))}\n\n'''
    i=i[:idx]+render+i[idx:]
# clear selection on edit off
i=i.replace('        setConnectMode(false);\n        setConnectFrom(null);','        setConnectMode(false);\n        setPumpTapFrom(null);\n        setConnectFrom(null);',1)
# fix duplicate fill opacity
i=i.replace('fill="#f8fafc" fillOpacity={0.38} fillOpacity={0.55}\n                      fillOpacity={0.62}','fill="#f8fafc"\n                      fillOpacity={0.38}')
infra.write_text(i,encoding='utf-8')

# EditableEdge cleanup
e=edge.read_text(encoding='utf-8-sig')
# remove PUMP-TAP console logs line-by-line conservatively
lines=[]
skip=False
for line in e.splitlines():
    if '[PUMP-TAP]' in line and 'console.log' in line:
        continue
    lines.append(line)
e='\n'.join(lines)+'\n'
# ensure clean clickable highlight block exists; existing one is acceptable if present
if 'data-role="pump-tap-connect-highlight"' not in e:
    marker='      {/* hit test */}'
    idx=e.find(marker)
    if idx<0: raise SystemExit('No encontré hit test EditableEdge.')
    block='''      {tapConnectMode && onTapPipeClick && (\n        <path\n          data-role="pump-tap-connect-highlight"\n          d={geom.d}\n          fill="none"\n          stroke="#38bdf8"\n          strokeWidth={18}\n          strokeLinecap="round"\n          strokeLinejoin="round"\n          opacity={0.32}\n          style={{ pointerEvents: "stroke", cursor: "crosshair" }}\n          onPointerDown={(ev) => {\n            const p = svgPointFromEvent(ev);\n            if (!p) return;\n            ev.preventDefault();\n            ev.stopPropagation();\n            onTapPipeClick(id, p.x, p.y);\n          }}\n        />\n      )}\n\n'''
    e=e[:idx]+block+e[idx:]
edge.write_text(e,encoding='utf-8')
print('V14 aplicado correctamente')
