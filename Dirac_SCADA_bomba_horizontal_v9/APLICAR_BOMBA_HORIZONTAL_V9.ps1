$ErrorActionPreference = "Stop"

$repo = Get-Location
$base = Join-Path $repo "FrontEnd\App_2\src\features\infra-diagram"
$pump = Join-Path $base "components\nodes\PumpNodeView.tsx"
$edge = Join-Path $base "components\edges\EditableEdge.tsx"

if (!(Test-Path $pump) -or !(Test-Path $edge)) {
    throw "No encuentro App_2. Ejecuta este script desde la raiz de DiracInstrumentacion."
}

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
Copy-Item (Join-Path $here "reemplazos\PumpNodeView.tsx") $pump -Force

Write-Host "Ajustando puertos de conexion..." -ForegroundColor Cyan
$e = Get-Content $edge -Raw

# Bombas horizontales:
# entrada = lateral derecho (R2 conceptual)
# salida = vertical superior (T1 conceptual)
#
# Seguimos usando L1/R1 en la DB, pero cambiamos su posición visual según orientacion.
$patterns = @(
    'if (pid.startsWith("L")) { const o = ((n as any).orientacion ?? (n as any).meta?.orientation ?? (n as any).orientation ?? "vertical"); return o === "horizontal" ? { x: (n as any).x - 84, y: (n as any).y } : { x: (n as any).x - 58, y: (n as any).y + 16 }; }',
    'if (pid.startsWith("R")) { const o = ((n as any).orientacion ?? (n as any).meta?.orientation ?? (n as any).orientation ?? "vertical"); return o === "horizontal" ? { x: (n as any).x + 84, y: (n as any).y } : { x: (n as any).x + 58, y: (n as any).y - 3 }; }'
)

$replacements = @(
    'if (pid.startsWith("L")) { const o = ((n as any).orientacion ?? (n as any).meta?.orientation ?? (n as any).orientation ?? "vertical"); return o === "horizontal" ? { x: (n as any).x + 88, y: (n as any).y + 12 } : { x: (n as any).x + 58, y: (n as any).y + 18 }; }',
    'if (pid.startsWith("R")) { const o = ((n as any).orientacion ?? (n as any).meta?.orientation ?? (n as any).orientation ?? "vertical"); return o === "horizontal" ? { x: (n as any).x + 26, y: (n as any).y - 54 } : { x: (n as any).x, y: (n as any).y - 72 }; }'
)

for ($j = 0; $j -lt $patterns.Count; $j++) {
    $e = $e.Replace($patterns[$j], $replacements[$j])
}

# Fallback para versiones anteriores
$e = $e.Replace(
'if (pid.startsWith("L")) return { x: (n as any).x - rOuter - portOffset, y: (n as any).y };',
'if (pid.startsWith("L")) { const o = ((n as any).orientacion ?? (n as any).meta?.orientation ?? (n as any).orientation ?? "vertical"); return o === "horizontal" ? { x: (n as any).x + 88, y: (n as any).y + 12 } : { x: (n as any).x + 58, y: (n as any).y + 18 }; }'
)

$e = $e.Replace(
'if (pid.startsWith("R")) return { x: (n as any).x + rOuter + portOffset, y: (n as any).y };',
'if (pid.startsWith("R")) { const o = ((n as any).orientacion ?? (n as any).meta?.orientation ?? (n as any).orientation ?? "vertical"); return o === "horizontal" ? { x: (n as any).x + 26, y: (n as any).y - 54 } : { x: (n as any).x, y: (n as any).y - 72 }; }'
)

Set-Content $edge $e -Encoding UTF8

Write-Host ""
Write-Host "Listo." -ForegroundColor Green
Write-Host "Horizontal: entrada derecha / salida arriba." -ForegroundColor Green
Write-Host "Nombre: adelante a la derecha." -ForegroundColor Green
Write-Host "Impulsor: gira cuando la bomba esta ON." -ForegroundColor Green
Write-Host ""
Write-Host "Ahora:"
Write-Host "  cd FrontEnd\App_2"
Write-Host "  npm run dev"
