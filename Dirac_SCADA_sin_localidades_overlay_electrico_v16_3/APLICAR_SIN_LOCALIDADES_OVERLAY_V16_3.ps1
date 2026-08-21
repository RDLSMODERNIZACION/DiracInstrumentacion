$ErrorActionPreference = "Stop"

$script = ".\Dirac_SCADA_sin_localidades_overlay_electrico_v16_3\APLICAR_V16_3.py"

if (!(Test-Path $script)) {
    throw "No encuentro $script. Ejecutá desde la raíz de DiracInstrumentacion."
}

if (Get-Command python -ErrorAction SilentlyContinue) {
    python $script
} elseif (Get-Command py -ErrorAction SilentlyContinue) {
    py $script
} else {
    throw "No encuentro Python en PATH."
}

if ($LASTEXITCODE -ne 0) {
    throw "No se pudo aplicar V16.3."
}

Write-Host ""
Write-Host "V16.3 aplicado." -ForegroundColor Green
Write-Host "Localidades visuales eliminadas y detalle eléctrico superpuesto." -ForegroundColor Green
