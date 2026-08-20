from pathlib import Path
import shutil
repo=Path.cwd(); base=repo/'FrontEnd/App_2/src/features/infra-diagram'; infra=base/'InfraDiagram.tsx'; edge=base/'components/edges/EditableEdge.tsx'; pump=base/'components/nodes/PumpNodeView.tsx'; init=repo/'Backend/app/routes/infraestructura/__init__.py'; bdir=repo/'Backend/app/routes/infraestructura'; here=Path(__file__).resolve().parent
for p in (infra,edge,pump,init):
    if not p.exists(): raise SystemExit(f'No encuentro {p}')
shutil.copy2(here/'reemplazos/PumpNodeView.tsx',pump); shutil.copy2(here/'nuevos/pump_taps.py',bdir/'pump_taps.py'); shutil.copy2(here/'nuevos/pumpTaps.ts',base/'services/pumpTaps.ts'); shutil.copy2(here/'nuevos/PumpPipeTapView.tsx',base/'components/PumpPipeTapView.tsx')
s=init.read_text(encoding='utf-8-sig')
if 'pump_taps_router' not in s: s=s.replace('from .mantenimiento import router as mantenimiento_router','from .mantenimiento import router as mantenimiento_router\nfrom .pump_taps import router as pump_taps_router')
if 'router.include_router(pump_taps_router)' not in s: s+='\nrouter.include_router(pump_taps_router)\n'
init.write_text(s,encoding='utf-8')
e=edge.read_text(encoding='utf-8-sig')
if 'tapConnectMode?: boolean;' not in e: e=e.replace('  onSelect?: (edgeId: number) => void;\n};','  onSelect?: (edgeId: number) => void;\n  tapConnectMode?: boolean;\n  onTapPipeClick?: (edgeId: number, x: number, y: number) => void;\n};')
if 'tapConnectMode,' not in e: e=e.replace('  selected,\n  onSelect,\n}: Props)','  selected,\n  onSelect,\n  tapConnectMode,\n  onTapPipeClick,\n}: Props)')
e=e.replace('style={{ pointerEvents: "stroke", cursor: editable ? "pointer" : "default" }}','style={{ pointerEvents: "stroke", cursor: tapConnectMode ? "crosshair" : editable ? "pointer" : "default" }}')
old='        onPointerDown={(e) => {\n          if (!editable) return;'
new='        onPointerDown={(e) => {\n          if (tapConnectMode && onTapPipeClick) {\n            const p = svgPointFromEvent(e);\n            if (p) { e.preventDefault(); e.stopPropagation(); onTapPipeClick(id, p.x, p.y); }\n            return;\n          }\n          if (!editable) return;'
if old in e and 'onTapPipeClick(id, p.x, p.y)' not in e: e=e.replace(old,new,1)
edge.write_text(e,encoding='utf-8')
i=infra.read_text(encoding='utf-8-sig')
if 'from "./services/pumpTaps"' not in i: i=i.replace('import { createEdge as apiCreateEdge, deleteEdge as apiDeleteEdge } from "./services/edges";','import { createEdge as apiCreateEdge, deleteEdge as apiDeleteEdge } from "./services/edges";\nimport { getPumpPipeTaps, savePumpPipeTap, type PumpPipeTap, type PumpPipeTapMode } from "./services/pumpTaps";')
if 'import PumpPipeTapView' not in i: i=i.replace('import NetworkAnalyzerNodeView from "./components/nodes/NetworkAnalyzerNodeView";','import NetworkAnalyzerNodeView from "./components/nodes/NetworkAnalyzerNodeView";\nimport PumpPipeTapView from "./components/PumpPipeTapView";')
if 'const [pumpPipeTaps' not in i:
    p=i.find('const [',i.find('export default function')); ls=i.rfind('\n',0,p)+1; i=i[:ls]+'  const [pumpPipeTaps, setPumpPipeTaps] = useState<PumpPipeTap[]>([]);\n  const [pumpTapFrom, setPumpTapFrom] = useState<string | null>(null);\n'+i[ls:]
if 'refreshPumpPipeTaps' not in i:
    a=i.find('  const toggleEdit = useCallback(')
    block='  const refreshPumpPipeTaps = useCallback(async () => { try { setPumpPipeTaps(await getPumpPipeTaps()); } catch (err) { console.error(err); } }, []);\n  useEffect(() => { refreshPumpPipeTaps(); }, [refreshPumpPipeTaps]);\n  const handlePumpTapPipeClick = useCallback(async (edgeId:number,x:number,y:number) => {\n    if(!pumpTapFrom) return; const pumpNode=nodesById[pumpTapFrom]; if(!pumpNode||pumpNode.type!=="pump")return;\n    const raw=window.prompt("Tipo de conexión:\\n1 = INYECTA\\n2 = EXTRAE","1"); if(raw==null)return; const mode:PumpPipeTapMode=String(raw).trim()==="2"?"extract":"inject";\n    const pumpId=Number(String(pumpNode.id).split(":").pop()); if(!Number.isFinite(pumpId))return;\n    try { await savePumpPipeTap({pump_id:pumpId,edge_id:edgeId,mode,x,y,t:0.5}); await refreshPumpPipeTaps(); setPumpTapFrom(null); } catch(err:any){ alert(err?.message||"No se pudo guardar"); }\n  },[pumpTapFrom,nodesById,refreshPumpPipeTaps]);\n\n'
    i=i[:a]+block+i[a:]
if 'const pumpTapByEdge' not in i:
    a=i.find('  const edgesForRender: UIEdgeWithPorts[] = useMemo(() => {'); helper='  const pumpTapByEdge = useMemo(() => { const m=new Map<number,PumpPipeTap[]>(); for(const tap of pumpPipeTaps){const a=m.get(tap.edge_id)??[];a.push(tap);m.set(tap.edge_id,a);} return m; },[pumpPipeTaps]);\n\n'; i=i[:a]+helper+i[a:]
start=i.find('  const edgesForRender: UIEdgeWithPorts[] = useMemo(() => {')
if start>=0:
    dep=i.find('  }, [',start); close=i.find(']);',dep)
    if dep>=0 and close>=0:
        close+=3; new='  const edgesForRender: UIEdgeWithPorts[] = useMemo(() => {\n    const base=simulateFlow(edges,nodesById).filter((e)=>nodesById[e.a]?.type!=="pump"&&nodesById[e.b]?.type!=="pump");\n    return base.map((e)=>{ const taps=pumpTapByEdge.get(e.id)??[]; const active=taps.find((tap)=>{const p=nodesById[tap.pump_node_id];return !!p&&isPumpOn(p);}); if(!active)return e; return {...e,flow:{on:true,dir:active.mode==="inject"?1:-1,strength:1}}; });\n  }, [edges, nodesById, pumpTapByEdge]);'; i=i[:start]+new+i[close:]
needle='                    knots={e.knots ?? []}\n                  />'
if needle in i and 'onTapPipeClick={handlePumpTapPipeClick}' not in i: i=i.replace(needle,'                    knots={e.knots ?? []}\n                    tapConnectMode={editMode && connectMode && !!pumpTapFrom}\n                    onTapPipeClick={handlePumpTapPipeClick}\n                  />',1)
needle='                      enabled={editMode}\n                      onClick={() => (!editMode && !connectMode ? maybeOpenOps(n) : undefined)}\n                    />'
if needle in i: i=i.replace(needle,'                      enabled={editMode}\n                      tapSelected={pumpTapFrom === n.id}\n                      onClick={() => { if(editMode&&connectMode){ setPumpTapFrom((prev)=>prev===n.id?null:n.id); setConnectFrom(null); return; } if(!editMode&&!connectMode) maybeOpenOps(n); }}\n                    />',1)
i=i.replace('                  nodes.map((n) => {','                  nodes.filter((n) => n.type !== "pump").map((n) => {',1)
marker='                {nodes.map((n) =>'
if marker in i and '{pumpPipeTaps.map((tap)' not in i: i=i.replace(marker,'                {pumpPipeTaps.map((tap)=>(<PumpPipeTapView key={`pump-tap-${tap.id}`} tap={tap} pump={nodesById[tap.pump_node_id]} visiblePoint={editMode&&connectMode}/>))}\n\n'+marker,1)
infra.write_text(i,encoding='utf-8')
print('V13 aplicado')
