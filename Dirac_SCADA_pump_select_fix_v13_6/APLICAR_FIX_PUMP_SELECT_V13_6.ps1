$ErrorActionPreference = "Stop"

$repo = Get-Location
$infra = Join-Path $repo "FrontEnd\App_2\src\features\infra-diagram\InfraDiagram.tsx"
$pump  = Join-Path $repo "FrontEnd\App_2\src\features\infra-diagram\components\nodes\PumpNodeView.tsx"

foreach ($f in @($infra,$pump)) {
    if (!(Test-Path $f)) {
        throw "No encuentro $f. Ejecutá desde la raíz de DiracInstrumentacion."
    }
}

Write-Host "Corrigiendo selección de bomba en modo Conectar..." -ForegroundColor Cyan

# ---------------- InfraDiagram ----------------
$i = Get-Content $infra -Raw

# En modo conectar, la bomba no debe arrastrarse.
$i = $i.Replace(
'enabled={editMode}',
'enabled={editMode && !connectMode}'
)

# Reemplazo específico del click compacto actual.
$oldClick = 'onClick={() => { if(editMode&&connectMode){ setPumpTapFrom((prev)=>prev===n.id?null:n.id); setConnectFrom(null); return; } if(!editMode&&!connectMode) maybeOpenOps(n); }}'
$newClick = 'onClick={() => { if(editMode&&connectMode){ console.log("[PUMP-TAP][PUMP_SELECT]", { id:n.id, editMode, connectMode, previous:pumpTapFrom }); setPumpTapFrom((prev)=>prev===n.id?null:n.id); setConnectFrom(null); return; } if(!editMode&&!connectMode) maybeOpenOps(n); }}'
$i = $i.Replace($oldClick,$newClick)

Set-Content $infra $i -Encoding UTF8

# ---------------- PumpNodeView ----------------
$p = Get-Content $pump -Raw

# Reforzar que el hook de drag no capture eventos si enabled=false.
$p = $p.Replace(
'onPointerDown={drag.onPointerDown}',
'onPointerDown={(e) => { if (enabled) drag.onPointerDown(e); }}'
)
$p = $p.Replace(
'onPointerMove={drag.onPointerMove}',
'onPointerMove={(e) => { if (enabled) drag.onPointerMove(e); }}'
)
$p = $p.Replace(
'onPointerUp={drag.onPointerUp}',
'onPointerUp={(e) => { if (enabled) drag.onPointerUp(e); }}'
)

Set-Content $pump $p -Encoding UTF8

Write-Host ""
Write-Host "LISTO." -ForegroundColor Green
Write-Host "Ahora en Editar + Conectar la bomba no se arrastra; se puede seleccionar con click." -ForegroundColor Green
Write-Host "Esperado en consola: [PUMP-TAP][PUMP_SELECT]" -ForegroundColor Yellow
