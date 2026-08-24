$ErrorActionPreference = "Stop"

$overview = ".\FrontEnd\App_Principal\src\components\scada\pages\OverviewGrid.tsx"
$usePlant = ".\FrontEnd\App_Principal\src\components\scada\hooks\usePlant.ts"
$pumpsBackend = ".\Backend\app\routes\pumps.py"

foreach ($f in @($overview,$usePlant,$pumpsBackend)) {
  if (!(Test-Path $f)) {
    throw "No encuentro $f. Ejecuta desde la raiz de DiracInstrumentacion."
  }
}

function Save-Utf8([string]$path,[string]$content) {
  $enc = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($path,$content,$enc)
}

Write-Host "Aplicando V18.53 - agrupar bombas por rol de red..." -ForegroundColor Cyan

# Backend
$b = [System.IO.File]::ReadAllText($pumpsBackend)

if ($b -notmatch 'p\.rol_red') {
  $b = $b.Replace(
    '      p.criticidad,',
    '      p.criticidad,' + "`r`n" + '      p.rol_red,'
  )
}

if ($b -notmatch '"network_role"') {
  $anchor = '                "criticality": r.get("criticidad"),'
  if (!$b.Contains($anchor)) { throw "No encontre criticality en pumps.py" }

  $b = $b.Replace(
    $anchor,
    $anchor + "`r`n" + '                "network_role": r.get("rol_red"),'
  )
}

Save-Utf8 $pumpsBackend $b

# usePlant
$u = [System.IO.File]::ReadAllText($usePlant)

if ($u -notmatch 'network_role\?:') {
  $anchor = '  criticality?: string | null;'
  if (!$u.Contains($anchor)) { throw "No encontre Pump.criticality en usePlant.ts" }
  $u = $u.Replace(
    $anchor,
    $anchor + "`r`n" + '  network_role?: string | null;'
  )
}

if ($u -notmatch 'network_role:\s*r\.network_role') {
  $anchor = '      criticality: r.criticality ?? null,'
  if (!$u.Contains($anchor)) { throw "No encontre mapping criticality en usePlant.ts" }
  $u = $u.Replace(
    $anchor,
    $anchor + "`r`n" + '      network_role: r.network_role ?? r.rol_red ?? null,'
  )
}

Save-Utf8 $usePlant $u

# Overview
$o = [System.IO.File]::ReadAllText($overview)

if ($o -notmatch 'function getPumpRole') {
  $anchor = 'export function OverviewGrid'
  $pos = $o.IndexOf($anchor)
  if ($pos -lt 0) { throw "No encontre OverviewGrid export" }

  $helper = @'
function getPumpRole(p: any): "principal" | "auxiliar" {
  const role = String(
    p?.network_role ??
    p?.rol_red ??
    p?.role_network ??
    ""
  )
    .trim()
    .toLowerCase();

  return role === "impulsion_principal" ? "principal" : "auxiliar";
}

'@

  $o = $o.Insert($pos,$helper)
}

$pattern = '(?s)<div className="grid grid-cols-1 gap-2 sm:grid-cols-2 2xl:grid-cols-3">\s*\{g\.items\s*\.filter\(\(it\) => it\.kind === "pump"\)\s*\.map\(renderItemCard\)\}\s*</div>'

$replacement = @'
<div className="space-y-3">
                  {g.items.some(
                    (it) => it.kind === "pump" && getPumpRole(it.obj) === "principal"
                  ) && (
                    <div>
                      <div className="mb-2 flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-blue-500" />
                        <span className="text-[11px] font-bold uppercase tracking-wide text-slate-600">
                          Impulsion principal
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {
                            g.items.filter(
                              (it) =>
                                it.kind === "pump" &&
                                getPumpRole(it.obj) === "principal"
                            ).length
                          }
                        </span>
                      </div>

                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 2xl:grid-cols-3">
                        {g.items
                          .filter(
                            (it) =>
                              it.kind === "pump" &&
                              getPumpRole(it.obj) === "principal"
                          )
                          .map(renderItemCard)}
                      </div>
                    </div>
                  )}

                  {g.items.some(
                    (it) => it.kind === "pump" && getPumpRole(it.obj) === "auxiliar"
                  ) && (
                    <div>
                      <div className="mb-2 flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-slate-400" />
                        <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                          Bombas auxiliares
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {
                            g.items.filter(
                              (it) =>
                                it.kind === "pump" &&
                                getPumpRole(it.obj) === "auxiliar"
                            ).length
                          }
                        </span>
                      </div>

                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 2xl:grid-cols-3">
                        {g.items
                          .filter(
                            (it) =>
                              it.kind === "pump" &&
                              getPumpRole(it.obj) === "auxiliar"
                          )
                          .map(renderItemCard)}
                      </div>
                    </div>
                  )}
                </div>
'@

$rx = New-Object System.Text.RegularExpressions.Regex(
  $pattern,
  [System.Text.RegularExpressions.RegexOptions]::Singleline
)

$newO = $rx.Replace($o,$replacement,1)

if ($newO -eq $o) {
  throw "No pude localizar el bloque responsive de bombas. Aplica antes V18.48/V18.49."
}

Save-Utf8 $overview $newO

Write-Host ""
Write-Host "V18.53 aplicado correctamente." -ForegroundColor Green
Write-Host "Todas las localidades separan bombas principales y auxiliares." -ForegroundColor Cyan
Write-Host "La clasificacion sale de pumps.rol_red en Supabase." -ForegroundColor Green
Write-Host ""
Write-Host "Proba:"
Write-Host "cd FrontEnd\App_Principal"
Write-Host "npm run build"
