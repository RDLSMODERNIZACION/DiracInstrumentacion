$ErrorActionPreference = "Stop"

$path = ".\FrontEnd\App_1\src\widget\index.tsx"

if (!(Test-Path $path)) {
    throw "No encuentro $path. Ejecutá desde la raíz de DiracInstrumentacion."
}

$txt = Get-Content $path -Raw

Write-Host "Aplicando V18.12 - quitar selectores de Operación..." -ForegroundColor Cyan

# ============================================================
# Eliminar toda la franja superior que contiene:
# - selector Ubicación
# - badges 24 h / bucket / actualizado
# - BaseSelectors de Tanques y Bombas
#
# Conservamos las Tabs y el nuevo resumen operativo.
# ============================================================

$returnPos = $txt.IndexOf("  return (")
if ($returnPos -lt 0) {
    throw "No encontré el return principal."
}

$startMarker = '      <div className="flex flex-wrap items-center gap-4">'
$endMarker   = '      <Tabs'

$start = $txt.IndexOf($startMarker, $returnPos)
$end   = $txt.IndexOf($endMarker, $start)

if ($start -lt 0) {
    throw "No encontré el bloque superior de selectores."
}

if ($end -lt 0) {
    throw "No encontré el bloque Tabs posterior a los selectores."
}

$txt = $txt.Substring(0, $start) + $txt.Substring($end)

Set-Content $path $txt -Encoding UTF8

Write-Host ""
Write-Host "V18.12 aplicado correctamente." -ForegroundColor Green
Write-Host "Se quitaron:" -ForegroundColor Green
Write-Host "- selector Ubicación superior"
Write-Host "- selector de Tanques"
Write-Host "- selector de Bombas"
Write-Host "- badges 24 h / bucket / actualizado de esa franja"
Write-Host ""
Write-Host "Las Tabs y el resumen de Impulsión / Distribución quedan intactos." -ForegroundColor Cyan
