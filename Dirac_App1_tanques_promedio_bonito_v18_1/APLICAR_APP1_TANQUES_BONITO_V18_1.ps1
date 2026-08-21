$ErrorActionPreference = "Stop"

$src = ".\Dirac_App1_tanques_promedio_bonito_v18_1\reemplazos\TankLevelChart.tsx"
$dst = ".\FrontEnd\App_1\src\components\TankLevelChart.tsx"

if (!(Test-Path $src)) {
    throw "No encuentro $src. Ejecutá desde la raíz de DiracInstrumentacion."
}

if (!(Test-Path $dst)) {
    throw "No encuentro $dst."
}

Copy-Item $src $dst -Force

Write-Host ""
Write-Host "V18.1 aplicado correctamente." -ForegroundColor Green
Write-Host "Se mejoró el diseño del gráfico de nivel promedio." -ForegroundColor Green
