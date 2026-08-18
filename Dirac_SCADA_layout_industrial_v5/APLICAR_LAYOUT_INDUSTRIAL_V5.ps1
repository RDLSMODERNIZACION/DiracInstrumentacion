$ErrorActionPreference = "Stop"

$repo = Get-Location
$base = Join-Path $repo "FrontEnd\App_2\src\features\infra-diagram"
$nodes = Join-Path $base "components\nodes"
$edge = Join-Path $base "components\edges\EditableEdge.tsx"
$infra = Join-Path $base "InfraDiagram.tsx"

if (!(Test-Path $infra)) {
    throw "Ejecuta este script desde la raiz de DiracInstrumentacion."
}

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$rep = Join-Path $here "reemplazos"

Write-Host "Aplicando componentes V5..." -ForegroundColor Cyan
Copy-Item (Join-Path $rep "TankNodeView.tsx") (Join-Path $nodes "TankNodeView.tsx") -Force
Copy-Item (Join-Path $rep "PumpNodeView.tsx") (Join-Path $nodes "PumpNodeView.tsx") -Force
if (Test-Path (Join-Path $rep "ManifoldNodeView.tsx")) { Copy-Item (Join-Path $rep "ManifoldNodeView.tsx") (Join-Path $nodes "ManifoldNodeView.tsx") -Force }
if (Test-Path (Join-Path $rep "ValveNodeView.tsx")) { Copy-Item (Join-Path $rep "ValveNodeView.tsx") (Join-Path $nodes "ValveNodeView.tsx") -Force }

$e = Get-Content $edge -Raw
$e = $e.Replace('const DEBUG_EDGE = true;', 'const DEBUG_EDGE = false;')
$e = $e.Replace('const rOuter = 32;', 'const rOuter = 34;')
$e = $e.Replace('const rOuter = 26;', 'const rOuter = 34;')
$e = $e.Replace('const portOffset = 14;', 'const portOffset = 16;')
$e = $e.Replace('const portOffset = 6;', 'const portOffset = 16;')
$e = $e.Replace('const halfW = 140;', 'const halfW = 140;')
$e = $e.Replace('const W = 280;', 'const W = 280;')
$e = $e.Replace('const H = 200;', 'const H = 200;')
$e = $e.Replace('strokeWidth={8}', 'strokeWidth={5}')
$e = $e.Replace('strokeWidth={6}', 'strokeWidth={4}')
$e = $e.Replace('strokeWidth={5}', 'strokeWidth={4}')
Set-Content $edge $e -Encoding UTF8

$i = Get-Content $infra -Raw
$i = $i.Replace('if (tt === "tank") return 140;', 'if (tt === "tank") return 140;')
$i = $i.Replace('if (tt === "tank") return 200;', 'if (tt === "tank") return 200;')
$i = $i.Replace('if (tt === "pump") return 46;', 'if (tt === "pump") return 50;')
$i = $i.Replace('if (tt === "pump") return 74;', 'if (tt === "pump") return 76;')
$i = $i.Replace('computeBBox(g.nodes, 58)', 'computeBBox(g.nodes, 46)')
$i = $i.Replace('computeBBox(g.nodes, 80)', 'computeBBox(g.nodes, 46)')
$i = $i.Replace('initialScale={2.75}', 'initialScale={2.55}')
$i = $i.Replace('initialScale={4.0}', 'initialScale={2.55}')
$i = $i.Replace('fill="url(#grid)" opacity={0.08}', 'fill="url(#grid)" opacity={0.03}')
$i = $i.Replace('fill="url(#grid)" opacity={0.14}', 'fill="url(#grid)" opacity={0.03}')
$i = $i.Replace('fill="#f8fafc" fillOpacity={0.55}', 'fill="#f8fafc" fillOpacity={0.38}')
$i = $i.Replace('stroke="#d3dce6"', 'stroke="#cfd8e3"')
$i = $i.Replace('fontSize: 15, fontWeight: 800, fill: "#334155"', 'fontSize: 18, fontWeight: 850, fill: "#1e293b"')
$i = $i.Replace('{g.name === "Sin ubicación" ? "" : g.name}', '{g.name === "Sin ubicación" ? "" : g.name}')
Set-Content $infra $i -Encoding UTF8

Write-Host ""
Write-Host "V5 aplicado." -ForegroundColor Green
Write-Host "Ahora:"
Write-Host "  cd FrontEnd\App_2"
Write-Host "  npm run dev"
Write-Host ""
Write-Host "Este pack mejora forma/estilo. Para que se vea realmente de proceso,"
Write-Host "el siguiente paso ya seria compactar coordenadas del layout." -ForegroundColor Yellow
