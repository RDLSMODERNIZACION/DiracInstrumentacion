$ErrorActionPreference = "Stop"

$path = ".\Backend\app\routes\infraestructura\layout.py"

if (!(Test-Path $path)) {
    throw "No encuentro $path. Ejecutá desde la raíz de DiracInstrumentacion."
}

$txt = Get-Content $path -Raw

$old = @'
                    NULL::text AS categoria,
                    l.id::bigint AS location_id,
                    l.name::text AS location_name,
'@

$new = @'
                    NULL::text AS categoria,
                    p.orientacion::text AS orientacion,
                    p.servicio::text AS servicio,
                    l.id::bigint AS location_id,
                    l.name::text AS location_name,
'@

if (!$txt.Contains($old)) {
    throw "No encontré el bloque de la CTE p esperado. No hice cambios."
}

$txt = $txt.Replace($old, $new)

Set-Content $path $txt -Encoding UTF8

Write-Host ""
Write-Host "FIX aplicado correctamente." -ForegroundColor Green
Write-Host "Se agregaron p.orientacion y p.servicio a la CTE de bombas." -ForegroundColor Green
Write-Host ""
Write-Host "Ahora hacé commit/push para que Render redeploye el backend." -ForegroundColor Yellow
