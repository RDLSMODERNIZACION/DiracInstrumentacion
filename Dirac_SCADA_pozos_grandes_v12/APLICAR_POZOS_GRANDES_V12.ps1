$ErrorActionPreference = "Stop"

$repo = Get-Location
$base = Join-Path $repo "FrontEnd\App_2\src\features\infra-diagram"
$tank = Join-Path $base "components\nodes\TankNodeView.tsx"
$infra = Join-Path $base "InfraDiagram.tsx"
$edge = Join-Path $base "components\edges\EditableEdge.tsx"

foreach ($f in @($tank,$infra,$edge)) {
  if (!(Test-Path $f)) {
    throw "No encuentro $f. Ejecuta este script desde la raiz de DiracInstrumentacion."
  }
}

$here = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "Aplicando pozo grande..." -ForegroundColor Cyan
Copy-Item (Join-Path $here "reemplazos\TankNodeView.tsx") $tank -Force

Write-Host "Ajustando puntos de conexion para pozos grandes..." -ForegroundColor Cyan
$e = Get-Content $edge -Raw

# Para tank/pozo, usar tamaño dinámico según categoria.
$old = @"
  if ((n as any).type === "tank") {
    const W = 300;
    const H = 220;

    const leftX = (n as any).x - W / 2;
    const rightX = (n as any).x + W / 2;
    const topY = (n as any).y - H / 2;
    const bottomY = (n as any).y + H / 2;
"@

$new = @"
  if ((n as any).type === "tank") {
    const isWell = (n as any).categoria === "pozo";
    const W = isWell ? 280 : 300;
    const H = isWell ? 330 : 220;

    const leftX = (n as any).x - W / 2;
    const rightX = (n as any).x + W / 2;
    const topY = (n as any).y - H / 2;
    const bottomY = (n as any).y + H / 2;
"@

if ($e.Contains($old)) {
    $e = $e.Replace($old, $new)
}

Set-Content $edge $e -Encoding UTF8

Write-Host "Ajustando puntos visibles de conectar para pozos..." -ForegroundColor Cyan
$i = Get-Content $infra -Raw

$oldBuild = @"
  if (n.type === "tank") {
    const halfW = 150;
    const halfH = 110;
"@

$newBuild = @"
  if (n.type === "tank") {
    const isWell = (n as any).categoria === "pozo";
    const halfW = isWell ? 140 : 150;
    const halfH = isWell ? 165 : 110;
"@

if ($i.Contains($oldBuild)) {
    $i = $i.Replace($oldBuild, $newBuild)
}

Set-Content $infra $i -Encoding UTF8

Write-Host ""
Write-Host "Listo." -ForegroundColor Green
Write-Host "- Pozos ahora mucho mas grandes." -ForegroundColor Green
Write-Host "- Tanques normales mantienen su tamaño." -ForegroundColor Green
Write-Host "- Los puntos de conectar respetan el nuevo tamaño del pozo." -ForegroundColor Green
Write-Host "- No modifica Supabase." -ForegroundColor Green
Write-Host ""
Write-Host "Ahora:"
Write-Host "  cd FrontEnd\App_2"
Write-Host "  npm run dev"
