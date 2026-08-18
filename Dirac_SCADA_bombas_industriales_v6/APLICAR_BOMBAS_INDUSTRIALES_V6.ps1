$ErrorActionPreference = "Stop"

$repo = Get-Location
$base = Join-Path $repo "FrontEnd\App_2\src\features\infra-diagram"
$nodes = Join-Path $base "components\nodes"
$edge = Join-Path $base "components\edges\EditableEdge.tsx"

if (!(Test-Path $edge)) {
    throw "No encuentro App_2. Ejecuta este script desde la raiz de DiracInstrumentacion."
}

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$rep = Join-Path $here "reemplazos"

Write-Host "Aplicando bomba vertical industrial..." -ForegroundColor Cyan
Copy-Item (Join-Path $rep "PumpNodeView.tsx") (Join-Path $nodes "PumpNodeView.tsx") -Force

Write-Host "Ajustando puntos de conexion de las bombas..." -ForegroundColor Cyan
$e = Get-Content $edge -Raw

# Default port pump: el nodo ahora es vertical.
# Entrada a la izquierda, descarga a la derecha.
$e = $e.Replace('const rOuter = 34;', 'const rOuter = 37;')
$e = $e.Replace('const rOuter = 32;', 'const rOuter = 37;')
$e = $e.Replace('const rOuter = 26;', 'const rOuter = 37;')

# Ajusta el offset de boquillas
$e = $e.Replace('const portOffset = 16;', 'const portOffset = 16;')
$e = $e.Replace('const portOffset = 14;', 'const portOffset = 16;')
$e = $e.Replace('const portOffset = 6;', 'const portOffset = 16;')

# Para puertos explícitos de pump, movemos y de entrada/salida para casar con el dibujo.
# Si el archivo tiene el bloque clásico, reemplazamos esos returns.
$e = $e.Replace(
'if (pid.startsWith("L")) return { x: (n as any).x - rOuter - portOffset, y: (n as any).y };',
'if (pid.startsWith("L")) return { x: (n as any).x - 53, y: (n as any).y + 16 };'
)
$e = $e.Replace(
'if (pid.startsWith("R")) return { x: (n as any).x + rOuter + portOffset, y: (n as any).y };',
'if (pid.startsWith("R")) return { x: (n as any).x + 53, y: (n as any).y - 3 };'
)

# Default pump port, si todavía usa cálculo genérico:
$e = $e.Replace(
'x = side === "in" ? (n as any).x - rOuter - portOffset : (n as any).x + rOuter + portOffset;`r`n    y = (n as any).y;',
'x = side === "in" ? (n as any).x - 53 : (n as any).x + 53;`r`n    y = side === "in" ? (n as any).y + 16 : (n as any).y - 3;'
)

Set-Content $edge $e -Encoding UTF8

Write-Host ""
Write-Host "Listo. No se modifico Supabase." -ForegroundColor Green
Write-Host "Ahora:"
Write-Host "  cd FrontEnd\App_2"
Write-Host "  npm run dev"
