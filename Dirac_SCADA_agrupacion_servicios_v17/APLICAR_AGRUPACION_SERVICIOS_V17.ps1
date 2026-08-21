$ErrorActionPreference = "Stop"

$script = ".\Dirac_SCADA_agrupacion_servicios_v17\APLICAR_V17.py"

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
    throw "No se pudo aplicar V17."
}

Write-Host ""
Write-Host "V17 aplicado." -ForegroundColor Green
Write-Host "Tabs: Todos / Agua / Cargaderos de agua / Cloacas." -ForegroundColor Green
Write-Host "En Editar, click en tanque o bomba para cambiar Grupo." -ForegroundColor Yellow
Write-Host "Reiniciá frontend y backend." -ForegroundColor Yellow
