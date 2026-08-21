$ErrorActionPreference = "Stop"

$path = ".\FrontEnd\App_1\src\widget\index.tsx"

if (!(Test-Path $path)) {
    throw "No encuentro $path. Ejecutá desde la raíz de DiracInstrumentacion."
}

$txt = Get-Content $path -Raw

Write-Host "Aplicando integración V18.5..." -ForegroundColor Cyan

# ------------------------------------------------------------
# 1) Agregar import si falta
# ------------------------------------------------------------
$importLine = 'import WaterNetworkOverviewDemo from "@/components/red/WaterNetworkOverview.demo";'

if ($txt -notmatch [regex]::Escape($importLine)) {
    $anchor = 'import TankLevelChart from "@/components/TankLevelChart";'

    if ($txt.Contains($anchor)) {
        $txt = $txt.Replace($anchor, $anchor + "`r`n" + $importLine)
    } else {
        # fallback: insertar después del import de React
        $reactImportPattern = '(import React[^;]+;)'
        $txt = [regex]::Replace(
            $txt,
            $reactImportPattern,
            '$1' + "`r`n" + $importLine,
            1
        )
    }
}

# ------------------------------------------------------------
# 2) Reemplazar SOLO el bloque de la pestaña operacion
#    desde {tab === "operacion" && ( ... )}
#    hasta antes de {tab === "eficiencia"
# ------------------------------------------------------------
$pattern = '(?s)\{tab\s*===\s*"operacion"\s*&&\s*\(.*?\)\}\s*(?=\{tab\s*===\s*"eficiencia")'

$replacement = @'
{tab === "operacion" && (
        <WaterNetworkOverviewDemo />
      )}


'@

$new = [regex]::Replace($txt, $pattern, $replacement, 1)

if ($new -eq $txt) {
    throw "No pude encontrar/reemplazar el bloque de la pestaña operacion."
}

$txt = $new

Set-Content $path $txt -Encoding UTF8

Write-Host ""
Write-Host "V18.5 aplicado correctamente." -ForegroundColor Green
Write-Host "La pestaña Operación ahora muestra WaterNetworkOverviewDemo." -ForegroundColor Green
Write-Host ""
Write-Host "Probá con:" -ForegroundColor Yellow
Write-Host "cd FrontEnd\App_1"
Write-Host "npm run dev"
