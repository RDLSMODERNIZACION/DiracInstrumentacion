$ErrorActionPreference = "Stop"

$overview = ".\FrontEnd\App_Principal\src\components\scada\pages\OverviewGrid.tsx"
$widgets  = ".\FrontEnd\App_Principal\src\components\scada\widgets.tsx"
$scada    = ".\FrontEnd\App_Principal\src\components\scada\ScadaApp.tsx"

foreach ($f in @($overview,$widgets,$scada)) {
  if (!(Test-Path $f)) { throw "No encuentro $f. Ejecuta desde la raiz de DiracInstrumentacion." }
}

Write-Host "Aplicando V18.42 - Operaciones mobile-first..." -ForegroundColor Cyan

# ============================================================
# 1) OverviewGrid
# ============================================================
$txt = Get-Content $overview -Raw

# Cards: mobile 1 columna real.
$txt = $txt.Replace(
  'className="col-span-1 sm:col-span-2 w-full justify-self-stretch"',
  'className="col-span-1 w-full justify-self-stretch"'
)

# Toolbar sticky y mas compacta en telefono.
$txt = $txt.Replace(
  'className="flex flex-col gap-3 sm:gap-4 p-3 sm:p-4 rounded-xl border border-slate-200 bg-white/80 backdrop-blur shadow-sm"',
  'className="sticky top-[57px] z-20 flex flex-col gap-2 p-2.5 sm:static sm:gap-4 sm:p-4 rounded-xl border border-slate-200 bg-white/95 backdrop-blur shadow-sm"'
)

# Filtros servicio / ubicacion siempre apilados en telefono.
$txt = $txt.Replace(
  'className="flex flex-col sm:flex-row sm:items-end gap-3 sm:gap-4"',
  'className="grid grid-cols-1 gap-2 sm:flex sm:flex-row sm:items-end sm:gap-4"'
)

# Botonera: 3 columnas fijas, sin saltos raros.
$txt = $txt.Replace(
  'className="inline-flex flex-wrap w-full sm:w-auto rounded-lg border border-slate-300 overflow-hidden shadow-sm"',
  'className="grid grid-cols-3 w-full sm:inline-flex sm:w-auto rounded-lg border border-slate-300 overflow-hidden shadow-sm"'
)

$txt = $txt.Replace(
  '"w-full sm:w-auto px-3 py-2 text-sm transition whitespace-nowrap border-t sm:border-t-0 border-slate-300 sm:border-0",',
  '"px-2 py-2 text-xs sm:px-3 sm:text-sm transition whitespace-nowrap border-l border-slate-300",'
)

# Grupo mucho mas compacto.
$txt = $txt.Replace(
  'className="rounded-2xl border border-slate-200 bg-white shadow-sm p-3 sm:p-4"',
  'className="rounded-xl border border-slate-200 bg-white shadow-sm p-2.5 sm:rounded-2xl sm:p-4"'
)

$txt = $txt.Replace(
  'className="flex items-center justify-between mb-3"',
  'className="flex items-start justify-between gap-2 mb-2 sm:items-center sm:mb-3"'
)

# Header: nombre + resumen humano en mobile.
$oldHeader = @'
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-900 truncate">
                    {g.groupName}
                    {g.groupCode ? <span className="ml-2 text-xs text-slate-500">({g.groupCode})</span> : null}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span
                    className="px-2 py-1 rounded-full text-xs border"
                    style={{ background: acc.pillBg, borderColor: acc.pillBd, color: acc.pillTx }}
                  >
                    {g.serviceType === "cloacas" ? "Cloacas" : "Agua"}
                  </span>
                  <span className="text-xs text-slate-500">
                    TK {g.tanks} · PU {g.pumps}
                  </span>
                </div>
'@

$newHeader = @'
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

if ($txt.Contains($oldHeader)) {
  $txt = $txt.Replace($oldHeader,$newHeader)
} else {
  Write-Host "Aviso: header de grupo no coincidio exactamente." -ForegroundColor Yellow
}

# Grid: en telefono siempre 1 columna.
$txt = $txt.Replace(
  'className="grid grid-cols-1 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8 gap-2 sm:gap-3 items-stretch justify-items-stretch"',
  'className="grid grid-cols-1 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8 sm:gap-3 items-stretch justify-items-stretch"'
)

Set-Content $overview $txt -Encoding UTF8

# ============================================================
# 2) widgets.tsx
# ============================================================
$w = Get-Content $widgets -Raw

# Tank card mas compacta en mobile.
$w = $w.Replace(
  'className={`text-left p-4 bg-white border border-slate-200 rounded-2xl hover:shadow-lg transition w-full ${dimClass}`}',
  'className={`text-left p-3 sm:p-4 bg-white border border-slate-200 rounded-xl sm:rounded-2xl hover:shadow-md transition w-full ${dimClass}`}'
)

$w = $w.Replace(
  'className="flex items-center justify-between mb-3"',
  'className="flex items-center justify-between gap-2 mb-2 sm:mb-3"'
)

# Ocultar badge Online cuando esta conectado; mostrar solo Offline.
$oldConnBadge = @'
          {/* Pastilla de conexión (siempre, con WS o fallback) */}
          <Badge tone={conn.tone}>
            {conn.online ? `Online${Number.isFinite(conn.ageSec) ? ` · ${fmtAgoShort(conn.ageSec)}` : ""}` : "Offline"}
          </Badge>

          {/* ✅ NUEVO: etiqueta de servicio (opcional, pero ayuda visual) */}
          <Badge tone={st === "cloacas" ? "ok" : "ok"}>{st === "cloacas" ? "Cloacas" : "Agua"}</Badge>

          {/* Severidad por nivel */}
          <Badge tone={meta.tone}>{meta.label}</Badge>
'@

$newConnBadge = @'
          {/* En mobile-first, si aparece el equipo se asume conectado.
              Solo mostramos una pastilla si hay un problema real. */}
          {!conn.online ? <Badge tone={conn.tone}>Sin comunicación</Badge> : null}
          {meta.label !== "Normal" ? <Badge tone={meta.tone}>{meta.label}</Badge> : null}
'@

if ($w.Contains($oldConnBadge)) {
  $w = $w.Replace($oldConnBadge,$newConnBadge)
} else {
  Write-Host "Aviso: badges de TankCard no coincidieron exactamente." -ForegroundColor Yellow
}

# Tanque visual mas chico en telefono.
$w = $w.Replace(
  'className="flex items-end gap-5"',
  'className="flex items-center gap-4 sm:items-end sm:gap-5"'
)
$w = $w.Replace(
  'className="relative w-[95px] h-44 border-[6px] border-slate-200 rounded-[28px] bg-slate-50 overflow-hidden shadow-inner"',
  'className="relative w-[58px] h-24 sm:w-[95px] sm:h-44 border-[4px] sm:border-[6px] border-slate-200 rounded-[18px] sm:rounded-[28px] bg-slate-50 overflow-hidden shadow-inner"'
)
$w = $w.Replace(
  'className="text-3xl font-semibold tabular-nums leading-none text-slate-800"',
  'className="text-3xl sm:text-3xl font-bold tabular-nums leading-none text-slate-900"'
)

# PumpCard: full width y horizontal en mobile.
$w = $w.Replace(
  '"group relative block w-full max-w-none min-w-0 sm:max-w-[150px] sm:min-w-[140px]",',
  '"group relative block w-full max-w-none min-w-0 sm:max-w-[150px] sm:min-w-[140px]",'
)
$w = $w.Replace(
  '"px-2.5 py-2 text-left transition",',
  '"px-3 py-2.5 sm:px-2.5 sm:py-2 text-left transition",'
)

# En bomba, no mostrar Online cuando esta conectada. Solo OFFLINE si falla.
$oldPumpFooter = @'
        <div className="mt-2 flex items-center justify-between">
          <span
            className={[
              "rounded-full border px-2 py-0.5 text-[10px] font-semibold",
              conn.online
                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                : tone === "warn"
                ? "bg-amber-50 text-amber-700 border-amber-200"
                : "bg-rose-50 text-rose-700 border-rose-200",
            ].join(" ")}
          >
            {conn.online ? "Online" : "Offline"}
          </span>

          <span
            className={[
              "rounded-full border px-2 py-0.5 text-[10px] font-semibold",
              isOn ? "bg-slate-900 text-white border-slate-900" : "bg-slate-50 text-slate-600 border-slate-200",
            ].join(" ")}
          >
            {isOn ? "ON" : "OFF"}
          </span>
        </div>

        <div className="mt-1 text-[10px] text-slate-500 text-right">{canSpin ? "Lista" : !conn.online ? "Sin conexión" : "Apagada"}</div>
'@

$newPumpFooter = @'
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

if ($w.Contains($oldPumpFooter)) {
  $w = $w.Replace($oldPumpFooter,$newPumpFooter)
} else {
  Write-Host "Aviso: footer de PumpCard no coincidio exactamente." -ForegroundColor Yellow
}

Set-Content $widgets $w -Encoding UTF8

# ============================================================
# 3) ScadaApp mobile shell
# ============================================================
$s = Get-Content $scada -Raw

# Menos margen/padding en operaciones telefono.
$s = $s.Replace(
  '<div className="max-w-7xl mx-auto p-4 md:p-6">',
  '<div className="w-full max-w-md mx-auto px-2.5 py-3 sm:max-w-7xl sm:p-4 md:p-6">',
  1
)

# Header mobile mas compacto y estable.
$s = $s.Replace(
  '<div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">',
  '<div className="w-full max-w-md mx-auto px-3 py-2.5 flex items-center justify-between sm:max-w-7xl sm:px-4 sm:py-3">'
)

$s = $s.Replace(
  '<div className="text-lg font-semibold tracking-tight">',
  '<div className="text-base sm:text-lg font-semibold tracking-tight">'
)

Set-Content $scada $s -Encoding UTF8

Write-Host ""
Write-Host "V18.42 aplicado." -ForegroundColor Green
Write-Host "Cambios mobile-first:" -ForegroundColor Cyan
Write-Host "- una columna por ubicacion"
Write-Host "- toolbar sticky"
Write-Host "- grupos compactos"
Write-Host "- sin badge Online cuando el equipo esta bien"
Write-Host "- solo muestra Sin comunicacion cuando corresponde"
Write-Host "- tanque reducido para telefono"
Write-Host "- bombas mas simples, prioriza ON/OFF"
Write-Host "- contenido limitado a ancho de telefono"
Write-Host ""
Write-Host "Proba:" -ForegroundColor Yellow
Write-Host "cd FrontEnd\App_Principal"
Write-Host "npm run build"
