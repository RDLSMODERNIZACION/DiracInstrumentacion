$ErrorActionPreference = "Stop"

$src = ".\Dirac_App1_graficos_tiempo_principales_v18_11\reemplazos\FrontEnd\App_1\src\components\red\WaterNetworkOverviewLive.tsx"
$dst = ".\FrontEnd\App_1\src\components\red\WaterNetworkOverviewLive.tsx"
$widget = ".\FrontEnd\App_1\src\widget\index.tsx"

foreach ($f in @($src, $widget)) {
    if (!(Test-Path $f)) {
        throw "No encuentro $f. Ejecutá desde la raíz de DiracInstrumentacion."
    }
}

Copy-Item $src $dst -Force

$txt = Get-Content $widget -Raw

# ============================================================
# 1) Constantes de equipos principales.
# ============================================================
$constMarker = 'const PRINCIPAL_PUMP_IDS = [12, 13, 14, 15, 16, 17, 18, 24, 25, 26, 29, 30];'

if (!$txt.Contains($constMarker)) {
    $anchor = 'type CombinedOperationEvent = {'
    $pos = $txt.IndexOf($anchor)
    if ($pos -lt 0) {
        throw "No encontré type CombinedOperationEvent."
    }

    $constants = @'
const PRINCIPAL_PUMP_IDS = [12, 13, 14, 15, 16, 17, 18, 24, 25, 26, 29, 30];
const PRINCIPAL_TANK_IDS = [7, 8, 9, 10, 11, 12, 21];

'@

    $txt = $txt.Insert($pos, $constants)
}

# ============================================================
# 2) Por defecto, en TODAS las localidades usar solo equipos principales.
# ============================================================
$txt = $txt.Replace(
'  const [selectedPumpIds, setSelectedPumpIds] = useState<number[] | "all">("all");',
'  const [selectedPumpIds, setSelectedPumpIds] = useState<number[] | "all">(PRINCIPAL_PUMP_IDS);'
)

$txt = $txt.Replace(
'  const [selectedTankIds, setSelectedTankIds] = useState<number[] | "all">("all");',
'  const [selectedTankIds, setSelectedTankIds] = useState<number[] | "all">(PRINCIPAL_TANK_IDS);'
)

$txt = $txt.Replace(
'    setSelectedPumpIds("all");' + [Environment]::NewLine + '    setSelectedTankIds("all");',
'    setSelectedPumpIds(locId == null ? PRINCIPAL_PUMP_IDS : "all");' + [Environment]::NewLine + '    setSelectedTankIds(locId == null ? PRINCIPAL_TANK_IDS : "all");'
)

# ============================================================
# 3) Pasar las series REALES que ya usaba el dashboard original.
# ============================================================
$old = '<WaterNetworkOverviewLive />'

$new = @'
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
'@

if (!$txt.Contains($old)) {
    throw "No encontré <WaterNetworkOverviewLive /> en index.tsx."
}

$txt = $txt.Replace($old, $new)

Set-Content $widget $txt -Encoding UTF8

Write-Host ""
Write-Host "V18.11 aplicado correctamente." -ForegroundColor Green
Write-Host ""
Write-Host "Cambios:" -ForegroundColor Cyan
Write-Host "- Bombas: vuelve el gráfico original EN EL TIEMPO."
Write-Host "- Tanques: vuelve el gráfico original EN EL TIEMPO."
Write-Host "- Se filtran las 12 bombas principales."
Write-Host "- Se filtran los 7 tanques principales."
Write-Host "- Los detalles quedan agrupados por localidad abajo."
Write-Host ""
Write-Host "Probá:" -ForegroundColor Yellow
Write-Host "cd FrontEnd\App_1"
Write-Host "npm run dev"
