$ErrorActionPreference = "Stop"

$opsPath = ".\FrontEnd\App_1\src\components\OpsPumpsProfile.tsx"
$overviewPath = ".\FrontEnd\App_1\src\components\red\WaterNetworkOverviewLive.tsx"
$widgetPath = ".\FrontEnd\App_1\src\widget\index.tsx"

foreach ($f in @($opsPath, $overviewPath, $widgetPath)) {
    if (!(Test-Path $f)) {
        throw "No encuentro $f. Ejecutá desde la raíz de DiracInstrumentacion."
    }
}

Write-Host "Aplicando V18.30 - popup con disponibilidad real desde base..." -ForegroundColor Cyan

# ============================================================
# 1) OpsPumpsProfile: reemplazar tooltip completo
# ============================================================
$ops = Get-Content $opsPath -Raw

$start = $ops.IndexOf("function CustomTooltip(")
$end = $ops.IndexOf("export default function OpsPumpsProfile", $start)

if ($start -lt 0 -or $end -lt 0) {
    throw "No pude localizar CustomTooltip en OpsPumpsProfile.tsx."
}

$newTooltip = @'
function CustomTooltip({
  active,
  label,
  payload,
  tz,
  availablePumpCount,
}: {
  active?: boolean;
  label?: any;
  payload?: any[];
  tz: string;
  availablePumpCount?: number;
}) {
  if (!active || !payload?.length) return null;

  const row = payload?.[0]?.payload as ChartRow | undefined;
  if (!row) return null;

  const onCount = Number.isFinite(Number(row.on)) ? Number(row.on) : 0;
  const available = Number.isFinite(Number(availablePumpCount))
    ? Number(availablePumpCount)
    : 0;

  return (
    <div className="w-[320px] rounded-xl border border-slate-200 bg-white/95 p-3 text-xs shadow-lg">
      <div className="mb-3 font-semibold text-slate-700">
        {fmtDateTime(Number(label ?? row.ms), tz)}
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-emerald-50 px-3 py-2">
          <div className="text-[11px] font-medium text-emerald-700">
            Bombas encendidas
          </div>
          <div className="mt-1 text-2xl font-bold text-emerald-800">
            {fmtInt(onCount)}
          </div>
        </div>

        <div className="rounded-lg bg-blue-50 px-3 py-2">
          <div className="text-[11px] font-medium text-blue-700">
            Bombas disponibles
          </div>
          <div className="mt-1 text-2xl font-bold text-blue-800">
            {fmtInt(available)}
          </div>
        </div>
      </div>

      <PumpNamesBlock
        title="Encendidas en este minuto"
        names={row.activePumpNames}
        empty="No hay bombas encendidas registradas para este minuto."
        colorClass="text-emerald-700"
      />
    </div>
  );
}

'@

$ops = $ops.Substring(0, $start) + $newTooltip + $ops.Substring($end)

# ============================================================
# 2) Agregar prop availablePumpCount al componente
# ============================================================
$destructureOld = @'
  showBrushIf = 0,
  timelineItems = [],
}: {
'@
$destructureNew = @'
  showBrushIf = 0,
  timelineItems = [],
  availablePumpCount = 0,
}: {
'@

if ($ops.Contains($destructureOld)) {
    $ops = $ops.Replace($destructureOld, $destructureNew)
} elseif (!$ops.Contains('availablePumpCount = 0')) {
    throw "No pude agregar availablePumpCount en OpsPumpsProfile."
}

$typeOld = '  timelineItems?: PumpTimelineItem[];' + [Environment]::NewLine + '}) {'
$typeNew = '  timelineItems?: PumpTimelineItem[];' + [Environment]::NewLine + '  availablePumpCount?: number;' + [Environment]::NewLine + '}) {'
if ($ops.Contains($typeOld)) {
    $ops = $ops.Replace($typeOld, $typeNew)
}

# ============================================================
# 3) Pasar availablePumpCount al tooltip
# ============================================================
$tooltipPattern = '<CustomTooltip {...props} tz={tz} />'
$tooltipReplacement = '<CustomTooltip {...props} tz={tz} availablePumpCount={availablePumpCount} />'
$ops = $ops.Replace($tooltipPattern, $tooltipReplacement)

Set-Content $opsPath $ops -Encoding UTF8

# ============================================================
# 4) WaterNetworkOverviewLive: contar disponibles desde DB
# ============================================================
$overview = Get-Content $overviewPath -Raw

$memoMarker = '  const pumpGroups = useMemo(() => {'
if (!$overview.Contains('const availablePumpCount = useMemo')) {
    $pos = $overview.IndexOf($memoMarker)
    if ($pos -lt 0) {
        throw "No encontré pumpGroups en WaterNetworkOverviewLive.tsx."
    }

    $memo = @'
  const availablePumpCount = useMemo(
    () =>
      availability.filter(
        (p) => p.rol_red === "impulsion_principal" && p.disponible === true
      ).length,
    [availability]
  );

'@

    $overview = $overview.Insert($pos, $memo)
}

$callAnchor = '            timelineItems={pumpTimelineItems}'
if ($overview.Contains($callAnchor) -and !$overview.Contains('availablePumpCount={availablePumpCount}')) {
    $overview = $overview.Replace(
        $callAnchor,
        $callAnchor + [Environment]::NewLine + '            availablePumpCount={availablePumpCount}'
    )
}

Set-Content $overviewPath $overview -Encoding UTF8

# ============================================================
# 5) Cargar timeline también cuando estamos en "Todas"
#    para poder mostrar nombres de bombas encendidas en el popup.
# ============================================================
$widget = Get-Content $widgetPath -Raw

$widget = [regex]::Replace(
    $widget,
    'const\s+shouldLoadPumpTimeline\s*=\s*tab\s*===\s*"operacion"\s*&&\s*locId\s*!=\s*null\s*;',
    'const shouldLoadPumpTimeline = tab === "operacion";',
    1
)

# Aumentar límite solo si quedó bajo; 50k alcanza para 12 bombas x 24h.
$widget = $widget.Replace(
    'limitTimeline: shouldLoadPumpTimeline ? 50000 : 0,',
    'limitTimeline: shouldLoadPumpTimeline ? 50000 : 0,'
)

Set-Content $widgetPath $widget -Encoding UTF8

Write-Host ""
Write-Host "V18.30 aplicado correctamente." -ForegroundColor Green
Write-Host "El popup ahora muestra:" -ForegroundColor Green
Write-Host "- Bombas encendidas en ese minuto"
Write-Host "- Bombas disponibles tomadas del campo pumps.disponible en Supabase"
Write-Host "- Nombres de las bombas encendidas"
Write-Host ""
Write-Host "También se habilitó el timeline de detalle aun cuando se ven Todas las localidades." -ForegroundColor Cyan
Write-Host ""
Write-Host "Probá:" -ForegroundColor Yellow
Write-Host "cd FrontEnd\App_1"
Write-Host "npm run dev"
