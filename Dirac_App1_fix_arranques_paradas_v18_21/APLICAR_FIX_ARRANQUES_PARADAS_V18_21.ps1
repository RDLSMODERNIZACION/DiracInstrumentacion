$ErrorActionPreference = "Stop"

$path = ".\Backend\app\routes\kpi\operation_reliability.py"

if (!(Test-Path $path)) {
    throw "No encuentro $path. Ejecutá desde la raíz de DiracInstrumentacion."
}

Write-Host "Aplicando V18.21 - conteo real de arranques/paradas..." -ForegroundColor Cyan

$txt = Get-Content $path -Raw

# Reemplazar toda referencia a la vista vieja por la corregida.
$old = "kpi.v_pump_operation_1d"
$new = "kpi.v_pump_operation_1d_corrected"

if ($txt.Contains($old)) {
    $txt = $txt.Replace($old, $new)
}

# Evitar duplicar "_corrected_corrected" si se ejecuta más de una vez.
$txt = $txt.Replace(
    "kpi.v_pump_operation_1d_corrected_corrected",
    "kpi.v_pump_operation_1d_corrected"
)

Set-Content $path $txt -Encoding UTF8

$count = ([regex]::Matches(
    $txt,
    [regex]::Escape("kpi.v_pump_operation_1d_corrected")
)).Count

if ($count -lt 1) {
    throw "No quedó ninguna referencia a la vista corregida."
}

Write-Host ""
Write-Host "V18.21 aplicado correctamente." -ForegroundColor Green
Write-Host "Referencias a vista corregida: $count" -ForegroundColor Green
Write-Host ""
Write-Host "La nueva lógica cuenta únicamente transiciones reales:" -ForegroundColor Cyan
Write-Host "- STOP -> RUN = 1 arranque"
Write-Host "- RUN -> STOP = 1 parada"
Write-Host "- estado arrastrado al comenzar el día = NO cuenta"
Write-Host ""
Write-Host "Después hacé:" -ForegroundColor Yellow
Write-Host "git add Backend/app/routes/kpi/operation_reliability.py"
Write-Host 'git commit -m "fix real pump start stop transitions"'
Write-Host "git push"
