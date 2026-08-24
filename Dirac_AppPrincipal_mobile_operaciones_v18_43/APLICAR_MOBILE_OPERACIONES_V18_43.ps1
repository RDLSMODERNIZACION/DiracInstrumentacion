$ErrorActionPreference = "Stop"

$overview = ".\FrontEnd\App_Principal\src\components\scada\pages\OverviewGrid.tsx"
$widgets  = ".\FrontEnd\App_Principal\src\components\scada\widgets.tsx"
$scada    = ".\FrontEnd\App_Principal\src\components\scada\ScadaApp.tsx"

foreach ($f in @($overview,$widgets,$scada)) {
  if (!(Test-Path $f)) {
    throw "No encuentro $f. Ejecuta desde la raiz de DiracInstrumentacion."
  }
}

Write-Host "Aplicando V18.43 - mobile-first robusto e idempotente..." -ForegroundColor Cyan

function Write-Utf8NoBom([string]$path, [string]$content) {
  $enc = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($path, $content, $enc)
}

# ============================================================
# OVERVIEW GRID
# ============================================================
$txt = [System.IO.File]::ReadAllText($overview)

# Tank wrappers: 1 columna en mobile.
$txt = $txt -replace 'className="col-span-1\s+sm:col-span-2\s+w-full\s+justify-self-stretch"', 'className="col-span-1 w-full justify-self-stretch"'

# Toolbar mobile sticky.
$txt = $txt -replace 'className="flex flex-col gap-3 sm:gap-4 p-3 sm:p-4 rounded-xl border border-slate-200 bg-white/80 backdrop-blur shadow-sm"', 'className="sticky top-[57px] z-20 flex flex-col gap-2 p-2.5 sm:static sm:gap-4 sm:p-4 rounded-xl border border-slate-200 bg-white/95 backdrop-blur shadow-sm"'

# Primera fila de filtros.
$txt = $txt -replace 'className="flex flex-col sm:flex-row sm:items-end gap-3 sm:gap-4"', 'className="grid grid-cols-1 gap-2 sm:flex sm:flex-row sm:items-end sm:gap-4"'

# Botonera inferior.
$txt = $txt -replace 'className="inline-flex flex-wrap w-full sm:w-auto rounded-lg border border-slate-300 overflow-hidden shadow-sm"', 'className="grid grid-cols-3 w-full sm:inline-flex sm:w-auto rounded-lg border border-slate-300 overflow-hidden shadow-sm"'

$txt = $txt -replace '"w-full sm:w-auto px-3 py-2 text-sm transition whitespace-nowrap border-t sm:border-t-0 border-slate-300 sm:border-0"', '"px-2 py-2 text-xs sm:px-3 sm:text-sm transition whitespace-nowrap border-l border-slate-300"'

# Grupo mas compacto.
$txt = $txt -replace 'className="rounded-2xl border border-slate-200 bg-white shadow-sm p-3 sm:p-4"', 'className="rounded-xl border border-slate-200 bg-white shadow-sm p-2.5 sm:rounded-2xl sm:p-4"'

$txt = $txt -replace 'className="flex items-center justify-between mb-3"', 'className="flex items-start justify-between gap-2 mb-2 sm:items-center sm:mb-3"'

# Grid siempre 1 columna en telefono.
$txt = $txt -replace 'className="grid grid-cols-1 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8 gap-2 sm:gap-3 items-stretch justify-items-stretch"', 'className="grid grid-cols-1 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8 sm:gap-3 items-stretch justify-items-stretch"'

# Header del grupo: reemplazo estructural, tolera espacios/cambios.
$headerPattern = '(?s)<div className="min-w-0">\s*<div className="text-sm font-semibold text-slate-900 truncate">\s*\{g\.groupName\}.*?</div>\s*</div>\s*<div className="flex items-center gap-2">\s*<span.*?>\s*\{g\.serviceType === "cloacas" \? "Cloacas" : "Agua"\}\s*</span>\s*<span className="text-xs text-slate-500">\s*TK \{g\.tanks\} · PU \{g\.pumps\}\s*</span>\s*</div>'

$headerReplacement = @'
<div className="min-w-0">
                  <div className="text-sm font-bold text-slate-900 truncate">
                    {g.groupName}
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-500">
                    {g.tanks} {g.tanks === 1 ? "tanque" : "tanques"} · {g.pumps} {g.pumps === 1 ? "bomba" : "bombas"}
                  </div>
                </div>

                <span
                  className="shrink-0 px-2 py-1 rounded-full text-[11px] border"
                  style={{ background: acc.pillBg, borderColor: acc.pillBd, color: acc.pillTx }}
                >
                  {g.serviceType === "cloacas" ? "Cloacas" : "Agua"}
                </span>
'@

$rxHeader = New-Object System.Text.RegularExpressions.Regex(
  $headerPattern,
  [System.Text.RegularExpressions.RegexOptions]::Singleline
)
$txt = $rxHeader.Replace($txt, $headerReplacement, 1)

Write-Utf8NoBom $overview $txt

# ============================================================
# WIDGETS
# ============================================================
$w = [System.IO.File]::ReadAllText($widgets)

# TankCard compacto.
$w = $w -replace 'text-left p-4 bg-white border border-slate-200 rounded-2xl hover:shadow-lg transition w-full', 'text-left p-3 sm:p-4 bg-white border border-slate-200 rounded-xl sm:rounded-2xl hover:shadow-md transition w-full'
$w = $w -replace 'className="flex items-end gap-5"', 'className="flex items-center gap-4 sm:items-end sm:gap-5"'
$w = $w -replace 'className="relative w-\[95px\] h-44 border-\[6px\] border-slate-200 rounded-\[28px\] bg-slate-50 overflow-hidden shadow-inner"', 'className="relative w-[58px] h-24 sm:w-[95px] sm:h-44 border-[4px] sm:border-[6px] border-slate-200 rounded-[18px] sm:rounded-[28px] bg-slate-50 overflow-hidden shadow-inner"'

# Tank badges: sacar Online, Agua y Normal. Mostrar solo problemas.
if ($w -notmatch 'En mobile-first, si aparece el equipo') {
  $tankBadgePattern = '(?s)\{/\* Pastilla de conexión.*?\*/\}\s*<Badge tone=\{conn\.tone\}>.*?</Badge>\s*\{/\*.*?etiqueta de servicio.*?\*/\}\s*<Badge.*?</Badge>\s*\{/\* Severidad por nivel \*/\}\s*<Badge tone=\{meta\.tone\}>\{meta\.label\}</Badge>'
  $tankBadgeReplacement = @'
{/* En mobile-first, si aparece el equipo se asume conectado.
              Solo mostramos problemas. */}
          {!conn.online ? <Badge tone={conn.tone}>Sin comunicación</Badge> : null}
          {meta.label !== "Normal" ? <Badge tone={meta.tone}>{meta.label}</Badge> : null}
'@
  $rxTankBadges = New-Object System.Text.RegularExpressions.Regex(
    $tankBadgePattern,
    [System.Text.RegularExpressions.RegexOptions]::Singleline
  )
  $w = $rxTankBadges.Replace($w, $tankBadgeReplacement, 1)
}

# Pump footer: sacar Online cuando esta conectado.
if ($w -notmatch 'Sin comunicación"\s*</span>\s*\)\s*:\s*<span />') {
  $pumpFooterPattern = '(?s)<div className="mt-2 flex items-center justify-between">\s*<span\s*className=\{\[.*?\]\.join\(" "\)\}\s*>\s*\{conn\.online \? "Online" : "Offline"\}\s*</span>\s*<span\s*className=\{\[.*?\]\.join\(" "\)\}\s*>\s*\{isOn \? "ON" : "OFF"\}\s*</span>\s*</div>\s*<div className="mt-1 text-\[10px\] text-slate-500 text-right">.*?</div>'
  $pumpFooterReplacement = @'
<div className="mt-2 flex items-center justify-between gap-2">
          {!conn.online ? (
            <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-700">
              Sin comunicación
            </span>
          ) : <span />}

          <span
            className={[
              "rounded-full border px-3 py-1 text-[11px] font-bold",
              isOn ? "bg-slate-900 text-white border-slate-900" : "bg-slate-50 text-slate-600 border-slate-200",
            ].join(" ")}
          >
            {isOn ? "ON" : "OFF"}
          </span>
        </div>
'@
  $rxPumpFooter = New-Object System.Text.RegularExpressions.Regex(
    $pumpFooterPattern,
    [System.Text.RegularExpressions.RegexOptions]::Singleline
  )
  $w = $rxPumpFooter.Replace($w, $pumpFooterReplacement, 1)
}

Write-Utf8NoBom $widgets $w

# ============================================================
# SCADA APP
# ============================================================
$s = [System.IO.File]::ReadAllText($scada)

# Solo el contenedor de operaciones. Regex con count=1, sin String.Replace de 3 args.
$opsPattern = 'if \(view === "operaciones"\) \{\s*return \(\s*<div className="max-w-7xl mx-auto p-4 md:p-6">'
$opsReplacement = 'if (view === "operaciones") {' + "`r`n" + '      return (' + "`r`n" + '        <div className="w-full max-w-md mx-auto px-2.5 py-3 sm:max-w-7xl sm:p-4 md:p-6">'
$rxOps = New-Object System.Text.RegularExpressions.Regex($opsPattern)
$s = $rxOps.Replace($s, $opsReplacement, 1)

# Header.
$s = $s -replace 'className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between"', 'className="w-full max-w-md mx-auto px-3 py-2.5 flex items-center justify-between sm:max-w-7xl sm:px-4 sm:py-3"'
$s = $s -replace 'className="text-lg font-semibold tracking-tight"', 'className="text-base sm:text-lg font-semibold tracking-tight"'

Write-Utf8NoBom $scada $s

Write-Host ""
Write-Host "V18.43 aplicado correctamente." -ForegroundColor Green
Write-Host ""
Write-Host "Resultado esperado:" -ForegroundColor Cyan
Write-Host "- una columna real en telefono"
Write-Host "- filtros compactos y sticky"
Write-Host "- sin badge Online en equipos normales"
Write-Host "- sin badge Agua repetido en tanque"
Write-Host "- sin badge Normal cuando no hay alarma"
Write-Host "- si pierde conexion: Sin comunicacion"
Write-Host "- bomba prioriza ON / OFF"
Write-Host "- tanque compacto"
Write-Host ""
Write-Host "Ahora proba:" -ForegroundColor Yellow
Write-Host "cd FrontEnd\App_Principal"
Write-Host "npm run build"
