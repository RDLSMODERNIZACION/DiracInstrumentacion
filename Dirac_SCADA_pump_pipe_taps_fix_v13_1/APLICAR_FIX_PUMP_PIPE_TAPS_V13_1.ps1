$ErrorActionPreference = "Stop"

$script = ".\Dirac_SCADA_pump_pipe_taps_fix_v13_1\APLICAR_FIX_V13_1.py"

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
    throw "No se pudo aplicar FIX V13.1."
}

Write-Host ""
Write-Host "LISTO." -ForegroundColor Green
Write-Host "Ahora la cañería tiene una zona de click más grande y las capas visuales no bloquean el click." -ForegroundColor Green
Write-Host ""
Write-Host "Probá:"
Write-Host "  cd FrontEnd\App_2"
Write-Host "  npm run dev"
