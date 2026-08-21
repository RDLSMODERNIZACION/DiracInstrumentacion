$ErrorActionPreference = "Stop"

$repo = Get-Location
$infra = Join-Path $repo "FrontEnd\App_2\src\features\infra-diagram\InfraDiagram.tsx"

if (!(Test-Path $infra)) {
    throw "No encuentro InfraDiagram.tsx. Ejecutá desde la raíz de DiracInstrumentacion."
}

$txt = Get-Content $infra -Raw

Write-Host "Aplicando V14.2 - selección de bomba idempotente..." -ForegroundColor Cyan

# 1) La selección de bomba NO debe alternar.
# Si el mismo evento entra más de una vez, queda seleccionada igual.
$txt = $txt.Replace(
'setPumpTapFrom((prev) => (prev === nodeId ? null : nodeId));',
'setPumpTapFrom(nodeId);'
)

# 2) Eliminar log STATE que haya quedado de versiones anteriores.
$pattern = '(?s)\s*useEffect\(\(\) => \{\s*console\.log\("\[PUMP-TAP\]\[STATE\]".*?\}, \[editMode, connectMode, pumpTapFrom, pumpPipeTaps\.length\]\);'
$txt = [regex]::Replace($txt, $pattern, '')

# 3) Eliminar listeners globales antiguos si todavía quedaron.
$pattern2 = '(?s)\s*useEffect\(\(\) => \{\s*const onPumpTapSelect = \(ev: Event\).*?\}, \[editMode, connectMode\]\);'
$txt = [regex]::Replace($txt, $pattern2, '')

# 4) Eliminar logs temporales PUMP-TAP, pero conservar console.error.
$txt = [regex]::Replace(
    $txt,
    '(?m)^\s*console\.log\("\[PUMP-TAP\].*?\);\s*$',
    ''
)

Set-Content $infra $txt -Encoding UTF8

Write-Host ""
Write-Host "V14.2 aplicado." -ForegroundColor Green
Write-Host "La bomba ahora queda seleccionada aunque el evento entre dos o más veces." -ForegroundColor Green
Write-Host "No vuelve a null por doble disparo." -ForegroundColor Yellow
