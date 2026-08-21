$ErrorActionPreference = "Stop"

$src = ".\Dirac_SCADA_conexiones_bombas_rectas_v14_7\reemplazos\PumpPipeTapView.tsx"
$dst = ".\FrontEnd\App_2\src\features\infra-diagram\components\PumpPipeTapView.tsx"

if (!(Test-Path $src)) {
    throw "No encuentro $src. Ejecutá desde la raíz de DiracInstrumentacion."
}

if (!(Test-Path $dst)) {
    throw "No encuentro $dst"
}

Copy-Item $src $dst -Force

Write-Host ""
Write-Host "V14.7 aplicado correctamente." -ForegroundColor Green
Write-Host "Las bombas verticales ahora conectan con ramal horizontal recto." -ForegroundColor Green
Write-Host "Se eliminó el escalón/codo en mitad de la conexión." -ForegroundColor Yellow
