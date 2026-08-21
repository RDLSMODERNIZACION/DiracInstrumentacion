$ErrorActionPreference = "Stop"

$rel = "FrontEnd/App_1/src/widget/index.tsx"
$path = ".\FrontEnd\App_1\src\widget\index.tsx"

if (!(Test-Path $path)) {
    throw "No encuentro $path. Ejecutá desde la raíz de DiracInstrumentacion."
}

Write-Host "Reconstruyendo index.tsx desde git HEAD y aplicando integración segura V18.6..." -ForegroundColor Cyan

# 1) Recuperar una versión JSX válida desde Git, sin tocar otros archivos.
$base = git show "HEAD:$rel"
if ($LASTEXITCODE -ne 0 -or !$base) {
    throw "No pude leer $rel desde git HEAD."
}

$txt = ($base -join [Environment]::NewLine)

# 2) Agregar import del nuevo resumen.
$importLine = 'import WaterNetworkOverviewDemo from "@/components/red/WaterNetworkOverview.demo";'

if ($txt -notmatch [regex]::Escape($importLine)) {
    $anchor = 'import TankLevelChart from "@/components/TankLevelChart";'

    if ($txt.Contains($anchor)) {
        $txt = $txt.Replace(
            $anchor,
            $anchor + [Environment]::NewLine + $importLine
        )
    } else {
        throw "No encontré el import de TankLevelChart."
    }
}

# 3) Ocultar los selectores grandes SOLO en Operación.
$oldSelectors = @'
      {(pumpOptions.length > 0 || tankOptions.length > 0) && (
        <BaseSelectors
'@

$newSelectors = @'
      {tab !== "operacion" && (pumpOptions.length > 0 || tankOptions.length > 0) && (
        <BaseSelectors
'@

if ($txt.Contains($oldSelectors)) {
    $txt = $txt.Replace($oldSelectors, $newSelectors)
}

# 4) Encontrar el bloque viejo de operación SIN cortarlo.
#    Lo desactivamos con false &&, conservando todo el JSX balanceado.
$oldOp = '{tab === "operacion" && ('
$newOp = '{false && tab === "operacion" && ('

$opPos = $txt.IndexOf($oldOp)
if ($opPos -lt 0) {
    throw "No encontré el bloque original de la pestaña Operación."
}

$txt = $txt.Substring(0, $opPos) + $newOp + $txt.Substring($opPos + $oldOp.Length)

# 5) Insertar la nueva vista justo antes del bloque viejo desactivado.
$insert = @'
      {tab === "operacion" && (
        <WaterNetworkOverviewDemo />
      )}

'@

$newOpPos = $txt.IndexOf($newOp)
$txt = $txt.Insert($newOpPos, $insert)

# 6) Guardar UTF-8.
Set-Content $path $txt -Encoding UTF8

Write-Host ""
Write-Host "V18.6 aplicado correctamente." -ForegroundColor Green
Write-Host "Se reconstruyó index.tsx válido y se integró la nueva vista sin cortar JSX." -ForegroundColor Green
Write-Host ""
Write-Host "Probá ahora:" -ForegroundColor Yellow
Write-Host "cd FrontEnd\App_1"
Write-Host "npm run dev"
