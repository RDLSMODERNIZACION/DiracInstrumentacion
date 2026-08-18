$ErrorActionPreference = "Stop"

$repo = Get-Location
$base = Join-Path $repo "FrontEnd\App_2\src\features\infra-diagram"
$nodes = Join-Path $base "components\nodes"
$edge = Join-Path $base "components\edges\EditableEdge.tsx"
$infra = Join-Path $base "InfraDiagram.tsx"

if (!(Test-Path $edge) -or !(Test-Path $infra)) {
    throw "No encuentro App_2. Ejecuta este script desde la raiz de DiracInstrumentacion."
}

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$rep = Join-Path $here "reemplazos"

Write-Host "Aplicando tanques y bombas V7..." -ForegroundColor Cyan
Copy-Item (Join-Path $rep "PumpNodeView.tsx") (Join-Path $nodes "PumpNodeView.tsx") -Force
Copy-Item (Join-Path $rep "TankNodeView.tsx") (Join-Path $nodes "TankNodeView.tsx") -Force

$e = Get-Content $edge -Raw

# Tamanos logicos nuevos
$e = $e.Replace('const rOuter = 37;', 'const rOuter = 42;')
$e = $e.Replace('const rOuter = 34;', 'const rOuter = 42;')
$e = $e.Replace('const rOuter = 32;', 'const rOuter = 42;')
$e = $e.Replace('const rOuter = 26;', 'const rOuter = 42;')
$e = $e.Replace('const halfW = 140;', 'const halfW = 145;')
$e = $e.Replace('const W = 280;', 'const W = 290;')
$e = $e.Replace('const H = 200;', 'const H = 210;')
$e = $e.Replace('const W = 220;', 'const W = 290;')
$e = $e.Replace('const H = 160;', 'const H = 210;')

# Bomba: soporta vertical y horizontal
$e = $e.Replace(
'if (pid.startsWith("L")) return { x: (n as any).x - 53, y: (n as any).y + 16 };',
'if (pid.startsWith("L")) { const o = ((n as any).meta?.orientation ?? (n as any).orientation ?? "vertical"); return o === "horizontal" ? { x: (n as any).x - 84, y: (n as any).y } : { x: (n as any).x - 58, y: (n as any).y + 16 }; }'
)
$e = $e.Replace(
'if (pid.startsWith("R")) return { x: (n as any).x + 53, y: (n as any).y - 3 };',
'if (pid.startsWith("R")) { const o = ((n as any).meta?.orientation ?? (n as any).orientation ?? "vertical"); return o === "horizontal" ? { x: (n as any).x + 84, y: (n as any).y } : { x: (n as any).x + 58, y: (n as any).y - 3 }; }'
)
$e = $e.Replace(
'x = side === "in" ? (n as any).x - 53 : (n as any).x + 53;`r`n    y = side === "in" ? (n as any).y + 16 : (n as any).y - 3;',
'const o = ((n as any).meta?.orientation ?? (n as any).orientation ?? "vertical");`r`n    x = side === "in" ? (o === "horizontal" ? (n as any).x - 84 : (n as any).x - 58) : (o === "horizontal" ? (n as any).x + 84 : (n as any).x + 58);`r`n    y = side === "in" ? (o === "horizontal" ? (n as any).y : (n as any).y + 16) : (o === "horizontal" ? (n as any).y : (n as any).y - 3);'
)

# Tanque: puertos mas expresivos (arriba/abajo/laterales)
$e = $e.Replace(
'case "L1": return { x: (n as any).x - halfW, y: (n as any).y - 19 };',
'case "L1": return { x: (n as any).x - 145, y: (n as any).y - 18 };'
)
$e = $e.Replace(
'case "L2": return { x: (n as any).x - halfW, y: (n as any).y + 32 };',
'case "L2": return { x: (n as any).x - 145, y: (n as any).y + 36 };'
)
$e = $e.Replace(
'case "R1": return { x: (n as any).x + halfW, y: (n as any).y - 38 };',
'case "R1": return { x: (n as any).x + 145, y: (n as any).y - 36 };'
)
$e = $e.Replace(
'case "R2": return { x: (n as any).x + halfW, y: (n as any).y };',
'case "R2": return { x: (n as any).x + 145, y: (n as any).y };'
)
$e = $e.Replace(
'case "R3": return { x: (n as any).x + halfW, y: (n as any).y + 32 };',
'case "R3": return { x: (n as any).x + 145, y: (n as any).y + 36 };'
)
$e = $e.Replace(
'case "T1": return { x: (n as any).x, y: (n as any).y - 100 };',
'case "T1": return { x: (n as any).x, y: (n as any).y - 105 };'
)
$e = $e.Replace(
'case "B1": return { x: (n as any).x, y: (n as any).y + 100 };',
'case "B1": return { x: (n as any).x, y: (n as any).y + 105 };'
)

Set-Content $edge $e -Encoding UTF8

$i = Get-Content $infra -Raw
$i = $i.Replace('if (tt === "tank") return 140;', 'if (tt === "tank") return 145;')
$i = $i.Replace('if (tt === "tank") return 200;', 'if (tt === "tank") return 210;')
$i = $i.Replace('if (tt === "pump") return 50;', 'if (tt === "pump") return 84;')
$i = $i.Replace('if (tt === "pump") return 76;', 'if (tt === "pump") return 124;')
Set-Content $infra $i -Encoding UTF8

Write-Host "" 
Write-Host "Listo. No se modifico Supabase." -ForegroundColor Green
Write-Host "Soporta bombas verticales y horizontales (meta.orientation = horizontal)." -ForegroundColor Green
Write-Host "Tanques con salida inferior y entrada superior mejor representadas." -ForegroundColor Green
Write-Host "" 
Write-Host "Ahora:" 
Write-Host "  cd FrontEnd\App_2" 
Write-Host "  npm run dev" 
