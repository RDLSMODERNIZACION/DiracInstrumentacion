$ErrorActionPreference = "Stop"

$src = ".\Dirac_App1_tanques_promedio_simple_v18_0\reemplazos\TankLevelChart.tsx"
$dst = ".\FrontEnd\App_1\src\components\TankLevelChart.tsx"

if (!(Test-Path $src)) {
    throw "No encuentro $src. Ejecutá desde la raíz de DiracInstrumentacion."
}

if (!(Test-Path $dst)) {
    throw "No encuentro $dst."
}

Copy-Item $src $dst -Force

Write-Host ""
Write-Host "V18.0 aplicado correctamente." -ForegroundColor Green
Write-Host "El gráfico de tanques ahora muestra solamente el promedio." -ForegroundColor Green
Write-Host "Se quitaron banda min/max, mínimos, máximos y anotaciones confusas." -ForegroundColor Yellow
