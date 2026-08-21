$ErrorActionPreference = "Stop"

$frontendSrc = ".\Dirac_App1_disponibilidad_selector_v18_24\reemplazos\FrontEnd\App_1\src\components\red\WaterNetworkOverviewLive.tsx"
$frontendDst = ".\FrontEnd\App_1\src\components\red\WaterNetworkOverviewLive.tsx"
$backendSrc = ".\Dirac_App1_disponibilidad_selector_v18_24\reemplazos\Backend\app\routes\infraestructura\pump_availability.py"
$backendDst = ".\Backend\app\routes\infraestructura\pump_availability.py"

foreach ($f in @($frontendSrc, $backendSrc, $frontendDst, $backendDst)) {
    if (!(Test-Path $f)) {
        throw "No encuentro $f. Ejecutá desde la raíz de DiracInstrumentacion."
    }
}

Write-Host "Aplicando V18.24 - selector de disponibilidad en bombas de impulsión..." -ForegroundColor Cyan
Copy-Item $frontendSrc $frontendDst -Force
Copy-Item $backendSrc $backendDst -Force
Write-Host "" 
Write-Host "V18.24 aplicado correctamente." -ForegroundColor Green
Write-Host "" 
Write-Host "IMPORTANTE:" -ForegroundColor Yellow
Write-Host "1) Ejecutá el SQL 01_SQL_SUPABASE_disponibilidad_descripcion.sql en Supabase." -ForegroundColor Yellow
Write-Host "2) Reiniciá backend / redeploy en Render." -ForegroundColor Yellow
Write-Host "3) Levantá App_1 otra vez con npm run dev." -ForegroundColor Yellow
