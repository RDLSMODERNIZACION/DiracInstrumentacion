$ErrorActionPreference = "Stop"

$src = ".\Dirac_App1_tanques_profesional_v18_2\reemplazos\TankLevelChart.tsx"
$dst = ".\FrontEnd\App_1\src\components\TankLevelChart.tsx"

if (!(Test-Path $src)) {
    throw "No encuentro $src. Ejecutá desde la raíz de DiracInstrumentacion."
}
if (!(Test-Path $dst)) {
    throw "No encuentro $dst."
}

Copy-Item $src $dst -Force

Write-Host ""
Write-Host "V18.2 aplicado correctamente." -ForegroundColor Green
Write-Host "Diseño profesional y más sobrio para el gráfico de nivel." -ForegroundColor Green
