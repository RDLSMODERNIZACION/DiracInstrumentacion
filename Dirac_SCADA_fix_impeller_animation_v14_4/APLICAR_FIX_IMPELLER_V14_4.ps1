$ErrorActionPreference = "Stop"

$repo = Get-Location
$src = ".\Dirac_SCADA_fix_impeller_animation_v14_4\reemplazos\PumpNodeView.tsx"
$dst = ".\FrontEnd\App_2\src\features\infra-diagram\components\nodes\PumpNodeView.tsx"

if (!(Test-Path $src)) {
    throw "No encuentro $src. Ejecutá desde la raíz de DiracInstrumentacion."
}

if (!(Test-Path $dst)) {
    throw "No encuentro $dst."
}

Copy-Item $src $dst -Force

Write-Host ""
Write-Host "V14.4 aplicado." -ForegroundColor Green
Write-Host "Se reemplazó PumpNodeView completo." -ForegroundColor Green
Write-Host "La rotación ahora ocurre en un grupo interno y ya no mueve el rotor fuera del círculo." -ForegroundColor Yellow
