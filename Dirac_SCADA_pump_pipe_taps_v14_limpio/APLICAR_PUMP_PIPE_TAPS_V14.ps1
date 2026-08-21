$ErrorActionPreference = "Stop"
$script = ".\Dirac_SCADA_pump_pipe_taps_v14_limpio\APLICAR_V14.py"
if (!(Test-Path $script)) { throw "No encuentro $script. Ejecutá desde la raíz de DiracInstrumentacion." }
if (Get-Command python -ErrorAction SilentlyContinue) { python $script }
elseif (Get-Command py -ErrorAction SilentlyContinue) { py $script }
else { throw "No encuentro Python en PATH." }
if ($LASTEXITCODE -ne 0) { throw "No se pudo aplicar V14." }
Write-Host "V14 aplicado correctamente." -ForegroundColor Green
