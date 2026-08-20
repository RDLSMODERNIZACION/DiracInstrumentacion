$ErrorActionPreference = "Stop"

$script = ".\Dirac_SCADA_pump_pipe_taps_fix_v13_4\APLICAR_FIX_V13_4.py"

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
    throw "No se pudo aplicar FIX V13.4."
}

Write-Host ""
Write-Host "LISTO." -ForegroundColor Green
Write-Host "Ahora la cañería celeste visible ES la superficie clickeable." -ForegroundColor Green
Write-Host "Abrí F12 y filtrá por PUMP-TAP si querés verificar." -ForegroundColor Yellow
Write-Host ""
Write-Host "Probá:"
Write-Host "  cd FrontEnd\App_2"
Write-Host "  npm run dev"
