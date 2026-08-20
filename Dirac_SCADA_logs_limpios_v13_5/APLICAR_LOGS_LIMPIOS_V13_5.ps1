$ErrorActionPreference = "Stop"

$script = ".\Dirac_SCADA_logs_limpios_v13_5\LIMPIAR_LOGS_V13_5.py"

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
    throw "No se pudo aplicar la limpieza de logs."
}

Write-Host ""
Write-Host "LISTO." -ForegroundColor Green
Write-Host "Se apagaron los logs generales y quedaron solamente los [PUMP-TAP]." -ForegroundColor Green
