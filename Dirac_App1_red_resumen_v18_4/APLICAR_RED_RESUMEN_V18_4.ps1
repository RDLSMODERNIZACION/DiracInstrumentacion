$ErrorActionPreference = "Stop"

$base = ".\FrontEnd\App_1\src\components\red"
$srcBase = ".\Dirac_App1_red_resumen_v18_4\reemplazos\src\components\red"

if (!(Test-Path $srcBase)) {
  throw "No encuentro $srcBase. Ejecutá desde la raíz de DiracInstrumentacion."
}

New-Item -ItemType Directory -Force -Path $base | Out-Null
Copy-Item "$srcBase\*" $base -Recurse -Force

Write-Host ""
Write-Host "V18.4 copiado correctamente." -ForegroundColor Green
Write-Host "Se agregaron los componentes base del nuevo resumen de red." -ForegroundColor Green
Write-Host "" 
Write-Host "Ahora importá este componente donde hoy renderizás la vista Operación:" -ForegroundColor Yellow
Write-Host "import WaterNetworkOverviewDemo from '@/components/red/WaterNetworkOverview.demo';"
Write-Host ""
Write-Host "Y renderizá temporalmente:" -ForegroundColor Yellow
Write-Host "<WaterNetworkOverviewDemo />"
Write-Host ""
Write-Host "Después reemplazamos el demo por datos reales de bombas principales y tanques principales." -ForegroundColor Cyan
