$ErrorActionPreference = "Stop"

$script = ".\Dirac_SCADA_pump_pipe_taps_fix_v13_2\APLICAR_FIX_V13_2.py"

if (!(Test-Path $script)) {
    throw "No encuentro $script. Ejecutá esto desde la raíz de DiracInstrumentacion."
}

if (Get-Command python -ErrorAction SilentlyContinue) {
    python $script
} elseif (Get-Command py -ErrorAction SilentlyContinue) {
    py $script
} else {
    throw "No encuentro Python en PATH."
}

if ($LASTEXITCODE -ne 0) {
    throw "No se pudo aplicar FIX V13.2."
}

Write-Host ""
Write-Host "LISTO." -ForegroundColor Green
Write-Host "Cuando selecciones una bomba, la cañería conectable se verá más ancha/celeste." -ForegroundColor Green
Write-Host "También aumenta la zona clickeable solo durante esa conexión." -ForegroundColor Green
Write-Host ""
Write-Host "Probá:"
Write-Host "  cd FrontEnd\App_2"
Write-Host "  npm run dev"
