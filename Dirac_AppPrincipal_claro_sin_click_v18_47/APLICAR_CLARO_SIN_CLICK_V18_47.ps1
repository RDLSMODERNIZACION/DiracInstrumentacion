$ErrorActionPreference = "Stop"

$overview = ".\FrontEnd\App_Principal\src\components\scada\pages\OverviewGrid.tsx"
$widgets  = ".\FrontEnd\App_Principal\src\components\scada\widgets.tsx"

foreach ($f in @($overview,$widgets)) {
  if (!(Test-Path $f)) {
    throw "No encuentro $f. Ejecuta desde la raiz de DiracInstrumentacion."
  }
}

function Write-Utf8NoBom([string]$path, [string]$content) {
  $enc = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($path, $content, $enc)
}

Write-Host "Aplicando V18.47 - tema claro y tarjetas sin accion..." -ForegroundColor Cyan

# ============================================================
# 1) OVERVIEW: quitar acciones al tocar y volver grupos claros
# ============================================================
$o = [System.IO.File]::ReadAllText($overview)

# Quitar onClick de TankCard y PumpCard desde renderItemCard.
$o = [regex]::Replace(
  $o,
  '<TankCard\s+tank=\{t\}\s+onClick=\{\(\) => onOpenTank\(t\.id\)\}\s+\{\.\.\.props\}\s*/>',
  '<TankCard tank={t} {...props} />'
)

$o = [regex]::Replace(
  $o,
  '<PumpCard\s+pump=\{p\}\s+onClick=\{\(\) => onOpenPump\(p\.id\)\}\s+\{\.\.\.props\}\s*/>',
  '<PumpCard pump={p} {...props} />'
)

# Fallback tolerante si hay nid en vez de id.
$o = [regex]::Replace(
  $o,
  'onClick=\{\(\) => onOpenTank\([^)]+\)\}\s*',
  ''
)
$o = [regex]::Replace(
  $o,
  'onClick=\{\(\) => onOpenPump\([^)]+\)\}\s*',
  ''
)

# Grupo blanco.
$o = $o.Replace(
  'className="rounded-xl border border-slate-800 bg-[#0b1118] shadow-sm p-2.5 sm:rounded-2xl sm:p-4"',
  'className="rounded-xl border border-slate-200 bg-white shadow-sm p-2.5 sm:rounded-2xl sm:p-4"'
)

$o = $o.Replace(
  'className="text-sm font-bold text-slate-100 truncate"',
  'className="text-sm font-bold text-slate-900 truncate"'
)

$o = $o.Replace(
  'className="mt-1 text-[11px] font-semibold text-slate-400"',
  'className="mt-1 text-[11px] font-semibold text-slate-600"'
)

Write-Utf8NoBom $overview $o

# ============================================================
# 2) WIDGETS: PumpCard clara, sin affordance de click
# ============================================================
$w = [System.IO.File]::ReadAllText($widgets)

# Si existe la PumpCard industrial oscura de V18.46, aclararla.
$w = $w.Replace(
  '"border-slate-700 bg-[#111820] px-3 py-3 text-left",',
  '"border-slate-200 bg-white px-3 py-3 text-left",'
)

$w = $w.Replace(
  '"shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]",',
  '"shadow-sm",'
)

$w = $w.Replace(
  '"transition hover:border-slate-600 active:scale-[0.995]",',
  '"transition",'
)

$w = $w.Replace(
  'className="truncate font-mono text-[15px] font-black tracking-wide text-slate-100"',
  'className="truncate font-mono text-[15px] font-black tracking-wide text-slate-900"'
)

$w = $w.Replace(
  'className="my-3 h-px bg-slate-700/80"',
  'className="my-3 h-px bg-slate-200"'
)

$w = $w.Replace(
  'className="font-mono text-lg text-slate-500 transition group-hover:text-slate-300"',
  'className="hidden"'
)

# Disponibilidad en tema claro.
$w = $w.Replace(
  '"border-amber-400/70 bg-amber-400/10 text-amber-300"',
  '"border-amber-300 bg-amber-50 text-amber-700"'
)
$w = $w.Replace(
  '"border-emerald-400/70 bg-emerald-400/10 text-emerald-300"',
  '"border-emerald-300 bg-emerald-50 text-emerald-700"'
)

# Estados en tema claro.
$w = $w.Replace('"text-rose-400"', '"text-rose-600"')
$w = $w.Replace('"text-emerald-400"', '"text-emerald-600"')
$w = $w.Replace('"text-slate-400"', '"text-slate-500"')

# Motivo de indisponibilidad.
$w = $w.Replace(
  'className="mt-2 truncate font-mono text-[11px] text-amber-200/80"',
  'className="mt-2 truncate font-mono text-[11px] text-amber-700"'
)

# Tarjetas sin semantica de boton/click.
# Cambiamos <button ...> de TankCard/PumpCard a <div ...> solo dentro de esas funciones.
# Hacemos reemplazo por bloques para no tocar otros botones auxiliares.
function Remove-Card-Button([string]$src, [string]$funcName) {
  $start = $src.IndexOf("export function $funcName")
  if ($start -lt 0) { return $src }

  $next = $src.IndexOf("export function ", $start + 20)
  if ($next -lt 0) { $next = $src.Length }

  $block = $src.Substring($start, $next - $start)

  # Primer button de la card.
  $block = [regex]::Replace(
    $block,
    '<button\s+onClick=\{onClick\}',
    '<div',
    1
  )

  # Si quedo onClick suelto por formato distinto.
  $block = $block.Replace('onClick={onClick}', '')

  # aria-label se puede conservar en div, pero role button no.
  # Cambiar el ultimo cierre de card.
  $lastButton = $block.LastIndexOf('</button>')
  if ($lastButton -ge 0) {
    $block = $block.Substring(0, $lastButton) + '</div>' + $block.Substring($lastButton + 9)
  }

  # Sacar hover/active de card si quedaran.
  $block = $block.Replace('hover:shadow-md active:scale-[0.99]', '')
  $block = $block.Replace('hover:border-slate-300 hover:shadow-sm active:scale-[0.995]', '')
  $block = $block.Replace('cursor-pointer', 'cursor-default')

  return $src.Substring(0, $start) + $block + $src.Substring($next)
}

$w = Remove-Card-Button $w "TankCard"
$w = Remove-Card-Button $w "PumpCard"

Write-Utf8NoBom $widgets $w

Write-Host ""
Write-Host "V18.47 aplicado correctamente." -ForegroundColor Green
Write-Host ""
Write-Host "Cambios:" -ForegroundColor Cyan
Write-Host "- mantiene estetica industrial pero en blanco"
Write-Host "- grupos vuelven a fondo blanco"
Write-Host "- bombas con borde gris fino y fondo blanco"
Write-Host "- conserva LED, estado, disponibilidad y datos 24h"
Write-Host "- elimina flecha decorativa de detalle"
Write-Host "- tocar tanque no hace nada"
Write-Host "- tocar bomba no hace nada"
Write-Host ""
Write-Host "Proba:" -ForegroundColor Yellow
Write-Host "cd FrontEnd\App_Principal"
Write-Host "npm run build"
