$ErrorActionPreference = "Stop"

$path = ".\Backend\app\routes\kpi\operation_reliability.py"

if (!(Test-Path $path)) {
    throw "No encuentro $path. Ejecutá desde la raíz de DiracInstrumentacion."
}

$txt = Get-Content $path -Raw

Write-Host "Aplicando V18.20 - corregir conteo de arranques/paradas..." -ForegroundColor Cyan

$old = "kpi.v_pump_operation_1d"
$new = "kpi.v_pump_operation_1d_corrected"

$countBefore = ([regex]::Matches($txt, [regex]::Escape($old))).Count

if ($countBefore -eq 0) {
    Write-Host "No encontré referencias a $old. Puede que ya esté corregido." -ForegroundColor Yellow
} else {
    $txt = $txt.Replace($old, $new)
    Set-Content $path $txt -Encoding UTF8
}

$countAfter = ([regex]::Matches($txt, [regex]::Escape($new))).Count

Write-Host ""
Write-Host "V18.20 aplicado correctamente." -ForegroundColor Green
Write-Host "Referencias corregidas: $countAfter" -ForegroundColor Green
Write-Host ""
Write-Host "Ahora el backend usa la vista corregida de Supabase." -ForegroundColor Cyan
Write-Host "Subí el cambio para que Render redeploye:" -ForegroundColor Yellow
Write-Host "git add Backend/app/routes/kpi/operation_reliability.py"
Write-Host 'git commit -m "fix pump start stop counts"'
Write-Host "git push"
