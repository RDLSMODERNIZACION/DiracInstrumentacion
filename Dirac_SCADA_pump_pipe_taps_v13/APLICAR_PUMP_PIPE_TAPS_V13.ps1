$ErrorActionPreference = "Stop"
$script = ".\Dirac_SCADA_pump_pipe_taps_v13\APLICAR_V13.py"
if (!(Test-Path $script)) { throw "No encuentro $script" }
if (Get-Command python -ErrorAction SilentlyContinue) { python $script } elseif (Get-Command py -ErrorAction SilentlyContinue) { py $script } else { throw "No encuentro Python" }
if ($LASTEXITCODE -ne 0) { throw "El parche V13 fallo" }
Write-Host "Listo. Editar -> Conectar -> bomba -> cañeria -> 1 inyecta / 2 extrae" -ForegroundColor Green
