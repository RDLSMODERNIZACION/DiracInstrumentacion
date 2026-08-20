$ErrorActionPreference = "Stop"

$repo = Get-Location
$infra = Join-Path $repo "FrontEnd\App_2\src\features\infra-diagram\InfraDiagram.tsx"
$edge = Join-Path $repo "FrontEnd\App_2\src\features\infra-diagram\components\edges\EditableEdge.tsx"
$service = Join-Path $repo "FrontEnd\App_2\src\features\infra-diagram\services\pumpTaps.ts"
$backend = Join-Path $repo "Backend\app\routes\infraestructura\pump_taps.py"

foreach ($f in @($infra,$edge,$service,$backend)) {
  if (!(Test-Path $f)) {
    throw "No encuentro $f. Aplicá primero V13/V13.2 y ejecutá esto desde la raíz."
  }
}

Write-Host "Agregando logs PUMP-TAP..." -ForegroundColor Cyan

# ---------------- InfraDiagram ----------------
$i = Get-Content $infra -Raw

if ($i -notmatch '\[PUMP-TAP\]\[PUMP_SELECT\]') {
  $i = $i.Replace(
'if (editMode && connectMode) {
                          setPumpTapFrom((prev) => (prev === n.id ? null : n.id));',
'if (editMode && connectMode) {
                          console.log("[PUMP-TAP][PUMP_SELECT]", { id: n.id, editMode, connectMode, pumpTapFrom });
                          setPumpTapFrom((prev) => (prev === n.id ? null : n.id));'
  )
}

if ($i -notmatch '\[PUMP-TAP\]\[PIPE_HANDLER\]') {
  $i = $i.Replace(
'async (edgeId: number, x: number, y: number) => {
      if (!pumpTapFrom) return;',
'async (edgeId: number, x: number, y: number) => {
      console.log("[PUMP-TAP][PIPE_HANDLER]", { pumpTapFrom, edgeId, x, y, editMode, connectMode });
      if (!pumpTapFrom) {
        console.warn("[PUMP-TAP][ABORT_NO_PUMP]");
        return;
      }'
  )
}

if ($i -notmatch '\[PUMP-TAP\]\[SAVE_REQUEST\]') {
  $i = $i.Replace(
'try {
        await savePumpPipeTap({',
'try {
        console.log("[PUMP-TAP][SAVE_REQUEST]", { pump_id: pumpId, edge_id: edgeId, mode, x, y });
        const saveResult = await savePumpPipeTap({'
  )

  $i = $i.Replace(
'          t: 0.5,
        });

        await refreshPumpPipeTaps();',
'          t: 0.5,
        });
        console.log("[PUMP-TAP][SAVE_OK]", saveResult);

        await refreshPumpPipeTaps();'
  )
}

Set-Content $infra $i -Encoding UTF8

# ---------------- EditableEdge ----------------
$e = Get-Content $edge -Raw

if ($e -notmatch '\[PUMP-TAP\]\[EDGE_POINTER\]') {
  $e = $e.Replace(
'if (tapConnectMode && onTapPipeClick) {
            const p = svgPointFromEvent(e);',
'if (tapConnectMode && onTapPipeClick) {
            console.log("[PUMP-TAP][EDGE_POINTER]", { edgeId: id, clientX: e.clientX, clientY: e.clientY });
            const p = svgPointFromEvent(e);
            console.log("[PUMP-TAP][SVG_POINT]", { edgeId: id, point: p });'
  )
}

if ($e -notmatch '\[PUMP-TAP\]\[DISPATCH\]') {
  $e = $e.Replace(
'onTapPipeClick(id, p.x, p.y);',
'console.log("[PUMP-TAP][DISPATCH]", { edgeId: id, x: p.x, y: p.y });
              onTapPipeClick(id, p.x, p.y);'
  )
}

Set-Content $edge $e -Encoding UTF8

# ---------------- pumpTaps.ts ----------------
$s = Get-Content $service -Raw

if ($s -notmatch '\[PUMP-TAP\]\[HTTP_POST\]') {
  $s = $s.Replace(
'  const res = await fetch(withScope(`${API_BASE}/infraestructura/pump_pipe_taps`), {',
'  const url = withScope(`${API_BASE}/infraestructura/pump_pipe_taps`);
  console.log("[PUMP-TAP][HTTP_POST]", { url, input });
  const res = await fetch(url, {'
  )
}

if ($s -notmatch '\[PUMP-TAP\]\[HTTP_STATUS\]') {
  $s = $s.Replace(
'  if (!res.ok) {',
'  console.log("[PUMP-TAP][HTTP_STATUS]", { status: res.status, ok: res.ok, statusText: res.statusText });
  if (!res.ok) {'
  )
}

Set-Content $service $s -Encoding UTF8

# ---------------- Backend ----------------
$b = Get-Content $backend -Raw

if ($b -notmatch '\[PUMP-TAP\]\[BACKEND_POST\]') {
  $b = $b.Replace(
'    data = await request.json()',
'    data = await request.json()
    print("[PUMP-TAP][BACKEND_POST]", data, flush=True)'
  )
}

if ($b -notmatch '\[PUMP-TAP\]\[BACKEND_DB_OK\]') {
  $b = $b.Replace(
'            row = cur.fetchone()
            conn.commit()
            return {"ok": True, "tap": row}',
'            row = cur.fetchone()
            conn.commit()
            print("[PUMP-TAP][BACKEND_DB_OK]", row, flush=True)
            return {"ok": True, "tap": row}'
  )
}

Set-Content $backend $b -Encoding UTF8

Write-Host ""
Write-Host "DEBUG aplicado." -ForegroundColor Green
Write-Host "Abrí F12 > Console y filtrá por PUMP-TAP." -ForegroundColor Yellow
Write-Host "También mirá la consola del backend." -ForegroundColor Yellow
