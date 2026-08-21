$ErrorActionPreference = "Stop"

$src = ".\Dirac_App1_impulsion_localidades_tanques_v18_9\reemplazos\FrontEnd\App_1\src\components\red\WaterNetworkOverviewLive.tsx"
$dst = ".\FrontEnd\App_1\src\components\red\WaterNetworkOverviewLive.tsx"

if (!(Test-Path $src)) {
    throw "No encuentro $src."
}
if (!(Test-Path ".\FrontEnd\App_1\src\components\red")) {
    New-Item -ItemType Directory -Force -Path ".\FrontEnd\App_1\src\components\red" | Out-Null
}

Copy-Item $src $dst -Force

Write-Host ""
Write-Host "V18.9 aplicado correctamente." -ForegroundColor Green
Write-Host "Ahora Impulsión queda agrupada por localidad y vuelve el gráfico de tanques." -ForegroundColor Green
Write-Host ""
Write-Host "Probá:" -ForegroundColor Yellow
Write-Host "cd FrontEnd\App_1"
Write-Host "npm run dev"
