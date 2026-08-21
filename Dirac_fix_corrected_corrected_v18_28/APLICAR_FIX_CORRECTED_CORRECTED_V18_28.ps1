$ErrorActionPreference = "Stop"

$path = ".\Backend\app\routes\kpi\operation_reliability.py"

if (!(Test-Path $path)) {
    throw "No encuentro $path. Ejecutá desde la raíz de DiracInstrumentacion."
}

$txt = Get-Content $path -Raw

Write-Host "Aplicando V18.28 - corregir nombre duplicado de vista KPI..." -ForegroundColor Cyan

$bad = "kpi.v_pump_operation_1d_corrected_corrected"
$good = "kpi.v_pump_operation_1d_corrected"

$countBad = ([regex]::Matches($txt, [regex]::Escape($bad))).Count

if ($countBad -eq 0) {
    Write-Host "No encontré '$bad'." -ForegroundColor Yellow
    Write-Host "Verificando que exista la referencia correcta..." -ForegroundColor Yellow
} else {
    $txt = $txt.Replace($bad, $good)
}

# Protección adicional contra futuras duplicaciones.
while ($txt.Contains("_corrected_corrected")) {
    $txt = $txt.Replace("_corrected_corrected", "_corrected")
}

Set-Content $path $txt -Encoding UTF8

$countGood = ([regex]::Matches($txt, [regex]::Escape($good))).Count
$countRemainingBad = ([regex]::Matches($txt, "corrected_corrected")).Count

if ($countGood -lt 1) {
    throw "No quedó ninguna referencia a $good."
}

if ($countRemainingBad -gt 0) {
    throw "Todavía quedaron referencias duplicated corrected_corrected."
}

Write-Host ""
Write-Host "V18.28 aplicado correctamente." -ForegroundColor Green
Write-Host "Referencias corregidas a: $good" -ForegroundColor Green
Write-Host "Cantidad de referencias correctas: $countGood" -ForegroundColor Cyan
Write-Host ""
Write-Host "Luego subí backend:" -ForegroundColor Yellow
Write-Host "git add Backend/app/routes/kpi/operation_reliability.py"
Write-Host 'git commit -m "fix duplicated corrected reliability view"'
Write-Host "git push"
