$ErrorActionPreference = "Stop"

$src = ".\Dirac_App1_detalle_disponibilidad_v18_26\reemplazos\FrontEnd\App_1\src\components\red\WaterNetworkOverviewLive.tsx"
$dst = ".\FrontEnd\App_1\src\components\red\WaterNetworkOverviewLive.tsx"

if (!(Test-Path $src)) {
    throw "No encuentro $src. Ejecutá desde la raíz de DiracInstrumentacion."
}

if (!(Test-Path $dst)) {
    throw "No encuentro $dst."
}

Copy-Item $src $dst -Force

Write-Host ""
Write-Host "V18.26 aplicado correctamente." -ForegroundColor Green
Write-Host "Se eliminaron las columnas de horas y arranques del detalle de impulsión." -ForegroundColor Green
Write-Host "Ahora queda una columna Detalle para indicar el motivo cuando una bomba está No disponible." -ForegroundColor Cyan
