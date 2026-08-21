$ErrorActionPreference = "Stop"

$opsPath = ".\FrontEnd\App_1\src\components\OpsPumpsProfile.tsx"
$overviewPath = ".\FrontEnd\App_1\src\components\red\WaterNetworkOverviewLive.tsx"
$widgetPath = ".\FrontEnd\App_1\src\widget\index.tsx"

foreach ($f in @($opsPath, $overviewPath, $widgetPath)) {
    if (!(Test-Path $f)) {
        throw "No encuentro $f. Ejecutá desde la raíz de DiracInstrumentacion."
    }
}

Write-Host "Aplicando V18.31 - popup disponibilidad real, parche robusto..." -ForegroundColor Cyan

# ============================================================
# 1) OpsPumpsProfile.tsx
# ============================================================
$ops = Get-Content $opsPath -Raw

# 1.a Reemplazar CustomTooltip completo, sin depender de cómo quedó V18.29
$tooltipStart = $ops.IndexOf("function CustomTooltip(")
$componentStart = $ops.IndexOf("export default function OpsPumpsProfile", $tooltipStart)

if ($tooltipStart -lt 0 -or $componentStart -lt 0) {
    throw "No pude localizar CustomTooltip / OpsPumpsProfile."
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

  const onCount =
    typeof row.on === "number" && Number.isFinite(row.on) ? row.on : 0;

  const available =
    typeof availablePumpCount === "number" &&
    Number.isFinite(availablePumpCount)
      ? availablePumpCount
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

$ops = $ops.Substring(0, $tooltipStart) + $newTooltip + $ops.Substring($componentStart)

# 1.b Agregar prop en destructuring usando regex
if ($ops -notmatch 'availablePumpCount\s*=\s*0') {
    $ops = [regex]::Replace(
        $ops,
        '(timelineItems\s*=\s*\[\]\s*,)',
        '$1' + [Environment]::NewLine + '  availablePumpCount = 0,',
        1
    )
}

# 1.c Agregar prop al tipo de argumentos
if ($ops -notmatch 'availablePumpCount\?\s*:\s*number') {
    $ops = [regex]::Replace(
        $ops,
        '(timelineItems\?\s*:\s*PumpTimelineItem\[\]\s*;)',
        '$1' + [Environment]::NewLine + '  availablePumpCount?: number;',
        1
    )
}

# 1.d Pasar prop a CustomTooltip
$ops = [regex]::Replace(
    $ops,
    '<CustomTooltip\s+\{\.\.\.props\}\s+tz=\{tz\}\s*/>',
    '<CustomTooltip {...props} tz={tz} availablePumpCount={availablePumpCount} />'
)

# Si ya tenía una versión parcialmente modificada, asegurar que use availablePumpCount
if ($ops -notmatch 'availablePumpCount=\{availablePumpCount\}') {
    throw "No pude conectar availablePumpCount al tooltip."
}

Set-Content $opsPath $ops -Encoding UTF8

# ============================================================
# 2) WaterNetworkOverviewLive.tsx
# ============================================================
$overview = Get-Content $overviewPath -Raw

# 2.a Calcular disponibles reales desde la respuesta /pump_availability
if ($overview -notmatch 'const availablePumpCount = useMemo') {
    $anchor = '  const pumpGroups = useMemo(() => {'
    $pos = $overview.IndexOf($anchor)

    if ($pos -lt 0) {
        throw "No encontré pumpGroups en WaterNetworkOverviewLive.tsx."
    }

    $memo = @'
  const availablePumpCount = useMemo(
    () =>
      availability.filter(
        (p) =>
          p.rol_red === "impulsion_principal" &&
          p.disponible === true
      ).length,
    [availability]
  );

'@

    $overview = $overview.Insert($pos, $memo)
}

# 2.b Pasarlo a OpsPumpsProfile, solo en el gráfico principal del resumen
if ($overview -notmatch 'availablePumpCount=\{availablePumpCount\}') {
    $pattern = '(?s)(<OpsPumpsProfile\s+.*?timelineItems=\{pumpTimelineItems\})'
    $m = [regex]::Match($overview, $pattern)

    if (!$m.Success) {
        throw "No encontré el OpsPumpsProfile principal en WaterNetworkOverviewLive."
    }

    $replacement = $m.Groups[1].Value + [Environment]::NewLine + '            availablePumpCount={availablePumpCount}'
    $overview = $overview.Substring(0, $m.Index) + $replacement + $overview.Substring($m.Index + $m.Length)
}

Set-Content $overviewPath $overview -Encoding UTF8

# ============================================================
# 3) index.tsx: cargar timeline también en Todas las localidades
# ============================================================
$widget = Get-Content $widgetPath -Raw

$widget = [regex]::Replace(
    $widget,
    'const\s+shouldLoadPumpTimeline\s*=\s*tab\s*===\s*"operacion"\s*&&\s*locId\s*!=\s*null\s*;',
    'const shouldLoadPumpTimeline = tab === "operacion";',
    1
)

Set-Content $widgetPath $widget -Encoding UTF8

Write-Host ""
Write-Host "V18.31 aplicado correctamente." -ForegroundColor Green
Write-Host ""
Write-Host "Popup de Impulsión:" -ForegroundColor Cyan
Write-Host "- Bombas encendidas en ese minuto"
Write-Host "- Bombas disponibles desde Supabase (pumps.disponible)"
Write-Host "- Lista de bombas encendidas"
Write-Host ""
Write-Host "Probá:" -ForegroundColor Yellow
Write-Host "cd FrontEnd\App_1"
Write-Host "npm run dev"
