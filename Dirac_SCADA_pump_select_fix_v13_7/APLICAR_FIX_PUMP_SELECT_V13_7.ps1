$ErrorActionPreference = "Stop"

$repo = Get-Location
$pump = Join-Path $repo "FrontEnd\App_2\src\features\infra-diagram\components\nodes\PumpNodeView.tsx"

if (!(Test-Path $pump)) {
    throw "No encuentro PumpNodeView.tsx. Ejecutá desde la raíz de DiracInstrumentacion."
}

$p = Get-Content $pump -Raw

Write-Host "Aplicando selección directa por PointerDown..." -ForegroundColor Cyan

# Reemplaza los handlers de pointer para que:
# - enabled=true  => drag normal
# - enabled=false => selección inmediata usando onClick
$p = $p.Replace(
'onPointerDown={(e) => { if (enabled) drag.onPointerDown(e); }}',
'onPointerDown={(e) => {
          if (enabled) {
            drag.onPointerDown(e);
            return;
          }

          if (onClick) {
            e.preventDefault();
            e.stopPropagation();
            console.log("[PUMP-TAP][PUMP_POINTER_SELECT]", { id: n.id });
            onClick();
          }
        }}'
)

$p = $p.Replace(
'onPointerMove={(e) => { if (enabled) drag.onPointerMove(e); }}',
'onPointerMove={(e) => { if (enabled) drag.onPointerMove(e); }}'
)

$p = $p.Replace(
'onPointerUp={(e) => { if (enabled) drag.onPointerUp(e); }}',
'onPointerUp={(e) => { if (enabled) drag.onPointerUp(e); }}'
)

# Si todavía quedó el handler original, reemplazarlo también.
$p = $p.Replace(
'onPointerDown={drag.onPointerDown}',
'onPointerDown={(e) => {
          if (enabled) {
            drag.onPointerDown(e);
            return;
          }

          if (onClick) {
            e.preventDefault();
            e.stopPropagation();
            console.log("[PUMP-TAP][PUMP_POINTER_SELECT]", { id: n.id });
            onClick();
          }
        }}'
)

# Evitar doble disparo de click cuando ya seleccionamos en pointerdown
$p = $p.Replace(
'onClick={(e: any) => {
          e.stopPropagation?.();
          onClick?.();
        }}',
'onClick={(e: any) => {
          e.stopPropagation?.();
          if (enabled) onClick?.();
        }}'
)

Set-Content $pump $p -Encoding UTF8

Write-Host ""
Write-Host "LISTO." -ForegroundColor Green
Write-Host "En modo Conectar la selección ocurre en PointerDown, antes de cualquier drag/click." -ForegroundColor Green
Write-Host "Buscá [PUMP-TAP][PUMP_POINTER_SELECT] en la consola." -ForegroundColor Yellow
