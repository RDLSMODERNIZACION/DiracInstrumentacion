$ErrorActionPreference = "Stop"

$frontendSrc = ".\Dirac_App1_fix_sintaxis_disponibilidad_v18_25\reemplazos\FrontEnd\App_1\src\components\red\WaterNetworkOverviewLive.tsx"
$frontendDst = ".\FrontEnd\App_1\src\components\red\WaterNetworkOverviewLive.tsx"

$backendSrc = ".\Dirac_App1_fix_sintaxis_disponibilidad_v18_25\reemplazos\Backend\app\routes\infraestructura\pump_availability.py"
$backendDst = ".\Backend\app\routes\infraestructura\pump_availability.py"

foreach ($f in @($frontendSrc, $frontendDst, $backendSrc, $backendDst)) {
    if (!(Test-Path $f)) {
        throw "No encuentro $f. Ejecutá desde la raíz de DiracInstrumentacion."
    }
}

Write-Host "Aplicando V18.25 - fix sintaxis disponibilidad..." -ForegroundColor Cyan

Copy-Item $frontendSrc $frontendDst -Force
Copy-Item $backendSrc $backendDst -Force

Write-Host ""
Write-Host "V18.25 aplicado correctamente." -ForegroundColor Green
Write-Host "Se corrigió el useEffect que había quedado sin cerrar en V18.24." -ForegroundColor Green
Write-Host ""
Write-Host "Probá ahora:" -ForegroundColor Yellow
Write-Host "cd FrontEnd\App_1"
Write-Host "npm run dev"
