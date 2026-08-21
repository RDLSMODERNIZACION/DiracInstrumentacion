$ErrorActionPreference = "Stop"

$src = ".\Dirac_App1_resumen_sutil_graficos_v18_10\reemplazos\FrontEnd\App_1\src\components\red\WaterNetworkOverviewLive.tsx"
$dst = ".\FrontEnd\App_1\src\components\red\WaterNetworkOverviewLive.tsx"

if (!(Test-Path $src)) {
    throw "No encuentro $src."
}

if (!(Test-Path ".\FrontEnd\App_1\src\components\red")) {
    New-Item -ItemType Directory -Force -Path ".\FrontEnd\App_1\src\components\red" | Out-Null
}

Copy-Item $src $dst -Force

Write-Host ""
Write-Host "V18.10 aplicado correctamente." -ForegroundColor Green
Write-Host "Ahora tenés gráfico de bombas al lado del gráfico de tanques y una vista más sutil." -ForegroundColor Green
Write-Host ""
Write-Host "Probá:" -ForegroundColor Yellow
Write-Host "cd FrontEnd\App_1"
Write-Host "npm run dev"
