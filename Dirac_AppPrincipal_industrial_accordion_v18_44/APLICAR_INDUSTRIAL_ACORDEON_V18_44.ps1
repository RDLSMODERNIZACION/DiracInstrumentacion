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

Write-Host "Aplicando V18.44 - vista industrial + acordeon..." -ForegroundColor Cyan

# ============================================================
# 1) OVERVIEW GRID: acordeon por ubicacion
# ============================================================
$txt = [System.IO.File]::ReadAllText($overview)

# Estado de grupo abierto
if ($txt -notmatch 'openGroupKey') {
  $anchor = 'const [svcTab, setSvcTab] = React.useState<ServiceType>("agua");'
  if (!$txt.Contains($anchor)) {
    throw "No encontre svcTab en OverviewGrid.tsx"
  }

  $insert = @'

  // V18.44: una sola ubicacion expandida a la vez en mobile
  const [openGroupKey, setOpenGroupKey] = React.useState<string | null>(null);
'@

  $txt = $txt.Replace($anchor, $anchor + $insert)
}

# Si cambia el servicio, cerrar acordeon para evitar mostrar un grupo de la pestaña anterior.
if ($txt -notmatch 'setOpenGroupKey\(null\).*setSvcTab') {
  $txt = $txt.Replace(
    'onClick={() => setSvcTab("agua")}',
    'onClick={() => { setSvcTab("agua"); setOpenGroupKey(null); }}'
  )
  $txt = $txt.Replace(
    'onClick={() => setSvcTab("cloacas")}',
    'onClick={() => { setSvcTab("cloacas"); setOpenGroupKey(null); }}'
  )
}

# Hacer clickable el header del grupo.
$headerClasses = @(
  'className="flex items-start justify-between gap-2 mb-2 sm:items-center sm:mb-3"',
  'className="flex items-center justify-between mb-3"'
)

foreach ($hc in $headerClasses) {
  if ($txt.Contains($hc) -and $txt -notmatch 'onClick=\{\(\) => setOpenGroupKey') {
    $replacement = $hc + "`r`n" +
      '                role="button"' + "`r`n" +
      '                tabIndex={0}' + "`r`n" +
      '                onClick={() => setOpenGroupKey((curr) => (curr === g.key ? null : g.key))}' + "`r`n" +
      '                onKeyDown={(e) => {' + "`r`n" +
      '                  if (e.key === "Enter" || e.key === " ") {' + "`r`n" +
      '                    e.preventDefault();' + "`r`n" +
      '                    setOpenGroupKey((curr) => (curr === g.key ? null : g.key));' + "`r`n" +
      '                  }' + "`r`n" +
      '                }}'
    $txt = $txt.Replace($hc, $replacement)
    break
  }
}

# Agregar chevron al bloque derecho sin romper si ya esta.
if ($txt -notmatch 'openGroupKey === g\.key \? "−" : "\+"') {
  $needle = '{g.serviceType === "cloacas" ? "Cloacas" : "Agua"}'
  $pos = $txt.IndexOf($needle, $txt.IndexOf('{filteredGroups.map'))
  if ($pos -ge 0) {
    $closeSpan = $txt.IndexOf('</span>', $pos)
    if ($closeSpan -ge 0) {
      $closeSpan += '</span>'.Length
      $chev = @'

                <span className="ml-2 grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-slate-200 bg-slate-50 text-sm font-black text-slate-600">
                  {openGroupKey === g.key ? "−" : "+"}
                </span>
'@
      $txt = $txt.Insert($closeSpan, $chev)
    }
  }
}

# Cerrar/abrir la grilla de items.
if ($txt -notmatch 'openGroupKey === g\.key && \(') {
  $gridCandidates = @(
    '<div className="grid grid-cols-1 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8 sm:gap-3 items-stretch justify-items-stretch">',
    '<div className="grid grid-cols-1 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8 gap-2 sm:gap-3 items-stretch justify-items-stretch">'
  )

  $gridFound = $null
  foreach ($g in $gridCandidates) {
    if ($txt.Contains($g)) { $gridFound = $g; break }
  }

  if (!$gridFound) {
    throw "No encontre la grilla de items dentro de los grupos."
  }

  $txt = $txt.Replace(
    $gridFound,
    '{openGroupKey === g.key && (' + "`r`n" + '              ' + $gridFound
  )

  $itemsAnchor = '{g.items.map(renderItemCard)}'
  $itemsPos = $txt.IndexOf($itemsAnchor, $txt.IndexOf('{filteredGroups.map'))
  if ($itemsPos -lt 0) {
    throw "No encontre g.items.map(renderItemCard)"
  }

  $gridClose = $txt.IndexOf('</div>', $itemsPos)
  if ($gridClose -lt 0) {
    throw "No encontre cierre de grilla."
  }

  $gridClose += '</div>'.Length
  $txt = $txt.Insert($gridClose, "`r`n              )}")
}

# Resumen cerrado mas util: nivel promedio visible si hay tanques.
if ($txt -notmatch 'Promedio del grupo') {
  $marker = '<div className="mt-0.5 text-[11px] text-slate-500">'
  $idx = $txt.IndexOf($marker, $txt.IndexOf('{filteredGroups.map'))
  if ($idx -ge 0) {
    $close = $txt.IndexOf('</div>', $idx)
    if ($close -ge 0) {
      $close += '</div>'.Length
      $summary = @'

                  {/* Promedio del grupo */}
                  {g.tanks > 0 && (
                    <div className="mt-1 text-[11px] font-semibold text-slate-600">
                      Nivel prom.{" "}
                      {(() => {
                        const vals = g.items
                          .filter((it) => it.kind === "tank")
                          .map((it) => Number(it.obj?.levelPct))
                          .filter((v) => Number.isFinite(v));
                        if (!vals.length) return "--";
                        return `${Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)}%`;
                      })()}
                    </div>
                  )}
'@
      $txt = $txt.Insert($close, $summary)
    }
  }
}

Write-Utf8NoBom $overview $txt

# ============================================================
# 2) WIDGETS: reemplazar TankCard por version industrial
# ============================================================
$w = [System.IO.File]::ReadAllText($widgets)

$start = $w.IndexOf('export function TankCard({')
$end = $w.IndexOf('/* =====================' + "`r`n" + '   PumpCard', $start)

if ($end -lt 0) {
  $end = $w.IndexOf('/* =====================' + "`n" + '   PumpCard', $start)
}

if ($start -lt 0 -or $end -lt 0) {
  throw "No pude localizar TankCard completo."
}

$newTankCard = @'
export function TankCard({
  tank,
  onClick,
  signal = "ok",
  status,
  serviceType,
}: {
  tank: any;
  onClick?: () => void;
  signal?: "ok" | "warn" | "bad";
  status?: ConnStatus;
  serviceType?: ServiceType;
}) {
  const sev = severityOf(tank.levelPct, tank.thresholds);
  const meta = sevMeta(sev);

  const level =
    typeof tank.levelPct === "number" && isFinite(tank.levelPct)
      ? tank.levelPct
      : null;

  const pct = clampPct(level ?? 0);

  const fallbackAge = secSince(tank?.latest?.ts);
  const fallbackTone: ConnStatus["tone"] =
    fallbackAge < WARN_SEC
      ? "ok"
      : fallbackAge < CRIT_SEC
      ? "warn"
      : "bad";

  const conn: ConnStatus =
    status ?? {
      online: fallbackAge < CRIT_SEC,
      ageSec: fallbackAge,
      tone: fallbackTone,
    };

  const tone = conn.tone ?? signal;

  const dimClass =
    tone === "bad"
      ? "opacity-70"
      : tone === "warn"
      ? "opacity-90"
      : "";

  const st = getServiceTypeFromTank(tank, serviceType);

  const barClass =
    st === "cloacas"
      ? "from-emerald-700 via-emerald-500 to-emerald-300"
      : "from-sky-700 via-cyan-500 to-cyan-300";

  const alarmClass =
    sev === "critical"
      ? "border-red-200 bg-red-50 text-red-700"
      : sev === "warning"
      ? "border-amber-200 bg-amber-50 text-amber-700"
      : "border-slate-200 bg-slate-50 text-slate-500";

  return (
    <button
      onClick={onClick}
      className={[
        "w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-left",
        "transition hover:border-slate-300 hover:shadow-sm active:scale-[0.995]",
        dimClass,
      ].join(" ")}
      aria-label={`Tanque ${tank.name}, nivel ${Math.round(pct)}%`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-bold text-slate-900">
            {tank.name}
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {!conn.online ? (
              <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-700">
                Sin comunicación
              </span>
            ) : null}

            {meta.label !== "Normal" ? (
              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${alarmClass}`}>
                {meta.label}
              </span>
            ) : null}
          </div>
        </div>

        <div className="shrink-0 text-3xl font-black leading-none tabular-nums text-slate-950">
          {Math.round(pct)}%
        </div>
      </div>

      <div className="mt-3">
        <div className="relative h-5 overflow-hidden rounded-md border border-slate-300 bg-slate-100 shadow-inner">
          <div
            className={`absolute inset-y-0 left-0 bg-gradient-to-r ${barClass}`}
            style={{
              width: `${pct}%`,
              transition: "width 650ms cubic-bezier(0.2,0.8,0.2,1)",
            }}
          />

          <div className="pointer-events-none absolute inset-0 flex">
            {[25, 50, 75].map((mark) => (
              <div
                key={mark}
                className="absolute inset-y-0 w-px bg-white/70"
                style={{ left: `${mark}%` }}
              />
            ))}
          </div>
        </div>

        <div className="mt-1.5 flex justify-between text-[9px] font-semibold uppercase tracking-wide text-slate-400">
          <span>0</span>
          <span>25</span>
          <span>50</span>
          <span>75</span>
          <span>100%</span>
        </div>
      </div>
    </button>
  );
}

'@

$w = $w.Substring(0, $start) + $newTankCard + $w.Substring($end)

Write-Utf8NoBom $widgets $w

Write-Host ""
Write-Host "V18.44 aplicado correctamente." -ForegroundColor Green
Write-Host ""
Write-Host "Ahora la vista queda:" -ForegroundColor Cyan
Write-Host "- acordeon por ubicacion"
Write-Host "- una sola ubicacion abierta a la vez"
Write-Host "- nivel promedio visible con el grupo cerrado"
Write-Host "- tanques sin dibujo 3D"
Write-Host "- barra industrial de nivel 0-100%"
Write-Host "- porcentaje grande"
Write-Host "- sin Online cuando todo esta normal"
Write-Host "- solo alarmas o Sin comunicacion"
Write-Host ""
Write-Host "Proba:" -ForegroundColor Yellow
Write-Host "cd FrontEnd\App_Principal"
Write-Host "npm run build"
