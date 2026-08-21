$ErrorActionPreference = "Stop"

$repo = Get-Location
$src = ".\Dirac_SCADA_electrico_compacto_v16\reemplazos\NetworkAnalyzerNodeView.tsx"
$dst = ".\FrontEnd\App_2\src\features\infra-diagram\components\nodes\NetworkAnalyzerNodeView.tsx"

if (!(Test-Path $src)) {
    throw "No encuentro $src. Ejecutá desde la raíz de DiracInstrumentacion."
}

if (!(Test-Path $dst)) {
    throw "No encuentro $dst."
}

Copy-Item $src $dst -Force

Write-Host ""
Write-Host "V16 aplicado correctamente." -ForegroundColor Green
Write-Host "El analizador ahora muestra solo kW en el sinóptico." -ForegroundColor Green
Write-Host "Click en operación => despliega variables eléctricas." -ForegroundColor Yellow
