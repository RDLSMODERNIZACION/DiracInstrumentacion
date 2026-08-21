$ErrorActionPreference = "Stop"

$src = ".\Dirac_SCADA_fix_bombas_manual_amperes_v17_6\reemplazos\PumpNodeView.tsx"
$dst = ".\FrontEnd\App_2\src\features\infra-diagram\components\nodes\PumpNodeView.tsx"

if (!(Test-Path $src)) {
    throw "No encuentro $src. Ejecutá desde la raíz de DiracInstrumentacion."
}

if (!(Test-Path $dst)) {
    throw "No encuentro $dst."
}

Copy-Item $src $dst -Force

Write-Host ""
Write-Host "V17.6 aplicado correctamente." -ForegroundColor Green
Write-Host "Se reemplazó PumpNodeView completo para evitar problemas con parches anteriores." -ForegroundColor Green
Write-Host "Queda M + amperes y sin ON/OFF." -ForegroundColor Yellow
