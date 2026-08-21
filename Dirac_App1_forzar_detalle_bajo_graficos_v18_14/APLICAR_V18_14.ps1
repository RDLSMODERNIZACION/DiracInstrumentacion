$ErrorActionPreference = "Stop"

$componentSrc = ".\Dirac_App1_forzar_detalle_bajo_graficos_v18_14\reemplazos\FrontEnd\App_1\src\components\red\WaterNetworkOverviewLive.tsx"
$componentDst = ".\FrontEnd\App_1\src\components\red\WaterNetworkOverviewLive.tsx"
$widget = ".\FrontEnd\App_1\src\widget\index.tsx"

foreach ($f in @($componentSrc, $widget)) {
    if (!(Test-Path $f)) {
        throw "No encuentro $f. Ejecutá desde la raíz de DiracInstrumentacion."
    }
}

Write-Host "Aplicando V18.14..." -ForegroundColor Cyan

# 1) Restaurar la versión del componente que tiene:
#    - gráfico bombas arriba izquierda
#    - gráfico tanques arriba derecha
#    - detalle bombas por localidad abajo izquierda
#    - detalle tanques por localidad abajo derecha
Copy-Item $componentSrc $componentDst -Force

$txt = Get-Content $widget -Raw

# 2) Asegurar import
$importLine = 'import WaterNetworkOverviewLive from "@/components/red/WaterNetworkOverviewLive";'
if (!$txt.Contains($importLine)) {
    $anchor = 'import TankLevelChart from "@/components/TankLevelChart";'
    if (!$txt.Contains($anchor)) {
        throw "No encontré import TankLevelChart en index.tsx."
    }
    $txt = $txt.Replace(
        $anchor,
        $anchor + [Environment]::NewLine + $importLine
    )
}

# 3) Desactivar TODOS los bloques viejos activos de Operación.
$oldActive = '{tab === "operacion" && ('
$oldDisabled = '{false && tab === "operacion" && ('
$txt = $txt.Replace($oldActive, $oldDisabled)

# 4) Insertar un único bloque nuevo activo antes del primer bloque viejo desactivado.
$marker = '{/* V18.14 RED PRINCIPAL */}'
if (!$txt.Contains($marker)) {
    $insertBefore = $txt.IndexOf($oldDisabled)

    if ($insertBefore -lt 0) {
        throw "No encontré el bloque viejo de Operación para insertar el nuevo resumen."
    }

    $newBlock = @'
      {/* V18.14 RED PRINCIPAL */}
      {tab === "operacion" && (
        <WaterNetworkOverviewLive
          pumpTs={playback.pumpTs}
          tankTs={playback.tankTs}
          pumpTimelineItems={pumpTimelineItems}
          xDomain={playback.domain}
          xTicks={playback.ticks}
          pumpSummaryItems={liveSync.pumpsSummary?.items ?? []}
          tankSummaryItems={liveSync.tanksSummary?.items ?? []}
          locationLabel={principalLocName}
        />
      )}

'@

    $txt = $txt.Insert($insertBefore, $newBlock)
}

# 5) Ocultar selector grande BaseSelectors si todavía quedó activo.
$baseSelectorsActive = '{(pumpOptions.length > 0 || tankOptions.length > 0) && ('
$baseSelectorsHidden = '{false && (pumpOptions.length > 0 || tankOptions.length > 0) && ('
if ($txt.Contains($baseSelectorsActive)) {
    $txt = $txt.Replace($baseSelectorsActive, $baseSelectorsHidden)
}

Set-Content $widget $txt -Encoding UTF8

Write-Host ""
Write-Host "V18.14 aplicado correctamente." -ForegroundColor Green
Write-Host ""
Write-Host "Ahora Operación debe mostrar solamente:" -ForegroundColor Yellow
Write-Host "1. Gráfico de Impulsión (arriba izquierda)"
Write-Host "2. Gráfico de Tanques (arriba derecha)"
Write-Host "3. Detalle de bombas por localidad (debajo de Impulsión)"
Write-Host "4. Detalle de tanques por localidad (debajo de Distribución)"
Write-Host ""
Write-Host "Se desactivan Auditoría, Eventos y Resumen por ubicación del bloque viejo." -ForegroundColor Cyan
Write-Host ""
Write-Host "Probá con:"
Write-Host "cd FrontEnd\App_1"
Write-Host "npm run dev"
