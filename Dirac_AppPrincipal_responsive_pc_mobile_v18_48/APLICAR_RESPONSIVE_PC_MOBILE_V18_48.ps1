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

Write-Host "Aplicando V18.48 - responsive PC + mobile..." -ForegroundColor Cyan

# ============================================================
# 1) OVERVIEW GRID
#    Mobile: 1 columna
#    PC: tanque a la izquierda, bombas en grilla a la derecha
# ============================================================
$o = [System.IO.File]::ReadAllText($overview)

# Reemplazar el renderItemCard por wrappers con clases semanticas.
$renderPattern = '(?s)const renderItemCard = \(it: GroupItem\) => \{.*?\n  \};'
$renderReplacement = @'
const renderItemCard = (it: GroupItem) => {
    if (it.kind === "tank") {
      const t = it.obj;
      const props = tankCardProps(t);

      return (
        <div
          key={`wrap-t-${t.id}`}
          className="dirac-tank-card w-full min-w-0"
        >
          <TankCard tank={t} {...props} />
        </div>
      );
    }

    const p = it.obj;
    const props = pumpCardProps(p);

    return (
      <div
        key={`wrap-p-${p.id}`}
        className="dirac-pump-card w-full min-w-0"
      >
        <PumpCard pump={p} {...props} />
      </div>
    );
  };
'@

$rxRender = New-Object System.Text.RegularExpressions.Regex(
  $renderPattern,
  [System.Text.RegularExpressions.RegexOptions]::Singleline
)

$newO = $rxRender.Replace($o, $renderReplacement, 1)
if ($newO -eq $o) {
  throw "No pude localizar renderItemCard en OverviewGrid.tsx"
}
$o = $newO

# Dentro de cada grupo, separar tanques y bombas en dos zonas responsive.
$oldMapPattern = '(?s)<div className="grid[^"]*items-stretch justify-items-stretch">\s*\{g\.items\.map\(renderItemCard\)\}\s*</div>'

$newMapBlock = @'
<div className="grid grid-cols-1 gap-3 xl:grid-cols-[300px_minmax(0,1fr)] xl:items-start">
                <div className="space-y-2">
                  {g.items
                    .filter((it) => it.kind === "tank")
                    .map(renderItemCard)}
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 2xl:grid-cols-3">
                  {g.items
                    .filter((it) => it.kind === "pump")
                    .map(renderItemCard)}
                </div>
              </div>
'@

$rxMap = New-Object System.Text.RegularExpressions.Regex(
  $oldMapPattern,
  [System.Text.RegularExpressions.RegexOptions]::Singleline
)

$newO = $rxMap.Replace($o, $newMapBlock, 1)

if ($newO -eq $o) {
  # Fallback: replace any current group grid containing g.items.map(renderItemCard)
  $fallback = '(?s)<div className="[^"]*grid[^"]*">\s*\{g\.items\.map\(renderItemCard\)\}\s*</div>'
  $rxFallback = New-Object System.Text.RegularExpressions.Regex(
    $fallback,
    [System.Text.RegularExpressions.RegexOptions]::Singleline
  )
  $newO = $rxFallback.Replace($o, $newMapBlock, 1)
}

if ($newO -eq $o) {
  throw "No pude localizar la grilla de items del grupo."
}

$o = $newO

# Header del grupo: mejor distribucion en PC.
$o = $o.Replace(
  'className="flex items-start justify-between gap-2 mb-2 sm:items-center sm:mb-3"',
  'className="flex items-start justify-between gap-3 mb-3 sm:items-center"'
)

# Evitar que el chip Agua quede flotando demasiado al centro.
$o = $o.Replace(
  'className="shrink-0 px-2 py-1 rounded-full text-[11px] border"',
  'className="shrink-0 rounded-full border px-2.5 py-1 text-[11px]"'
)

# Agregar estilos locales para balance desktop/mobile.
if ($o -notmatch 'V18\.48 RESPONSIVE') {
  $returnPos = $o.IndexOf('  return (')
  if ($returnPos -lt 0) {
    throw "No encontre return principal en OverviewGrid.tsx"
  }

  $rootPos = $o.IndexOf('<div className=', $returnPos)
  if ($rootPos -lt 0) {
    throw "No encontre root div en OverviewGrid.tsx"
  }

  $styleBlock = @'
      {/* V18.48 RESPONSIVE */}
      <style>{`
        @media (min-width: 1280px) {
          .dirac-tank-card > * {
            min-height: 100%;
          }

          .dirac-pump-card > * {
            min-height: 150px;
          }
        }

        @media (max-width: 639px) {
          .dirac-pump-card > * {
            min-height: 0;
          }
        }
      `}</style>

'@

  $o = $o.Insert($rootPos, $styleBlock)
}

Write-Utf8NoBom $overview $o

# ============================================================
# 2) WIDGETS
#    Compactar PumpCard en PC sin romper mobile.
# ============================================================
$w = [System.IO.File]::ReadAllText($widgets)

# Reducir padding y altura visual de bombas en desktop.
$w = $w.Replace(
  '"border-slate-200 bg-white px-3 py-3 text-left",',
  '"border-slate-200 bg-white px-3 py-3 text-left sm:px-3 sm:py-3 xl:px-3 xl:py-2.5",'
)

# Titulo un poco mas compacto en PC.
$w = $w.Replace(
  'className="truncate font-mono text-[15px] font-black tracking-wide text-slate-900"',
  'className="truncate font-mono text-[14px] font-black tracking-wide text-slate-900 sm:text-[15px]"'
)

# Estado mas compacto.
$w = $w.Replace(
  'className={`mt-3 font-mono text-[15px] font-bold tracking-[0.08em] ${stateClass}`}',
  'className={`mt-2 font-mono text-[13px] font-bold tracking-[0.08em] sm:text-[14px] ${stateClass}`}'
)

# Divisor menos aireado.
$w = $w.Replace(
  'className="my-3 h-px bg-slate-200"',
  'className="my-2.5 h-px bg-slate-200"'
)

# Datos 24h algo mas legibles en desktop.
$w = $w.Replace(
  'className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[11px] font-semibold text-slate-400"',
  'className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[10px] font-semibold text-slate-500 sm:text-[11px]"'
)

# TankCard: en desktop un poco mas estable como columna izquierda.
$w = $w.Replace(
  '"w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-left",',
  '"w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-left xl:min-h-[150px]",'
)

Write-Utf8NoBom $widgets $w

Write-Host ""
Write-Host "V18.48 aplicado correctamente." -ForegroundColor Green
Write-Host ""
Write-Host "Layout esperado:" -ForegroundColor Cyan
Write-Host "MOBILE:"
Write-Host "  tanque"
Write-Host "  bomba"
Write-Host "  bomba"
Write-Host ""
Write-Host "PC:"
Write-Host "  tanque a la izquierda"
Write-Host "  bombas en grilla de 2 o 3 columnas a la derecha"
Write-Host ""
Write-Host "Proba:" -ForegroundColor Yellow
Write-Host "cd FrontEnd\App_Principal"
Write-Host "npm run build"
