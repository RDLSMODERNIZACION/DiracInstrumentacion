$ErrorActionPreference = "Stop"

$tanksBackend = ".\Backend\app\routes\tanks.py"
$pumpsBackend = ".\Backend\app\routes\pumps.py"
$usePlant     = ".\FrontEnd\App_Principal\src\components\scada\hooks\usePlant.ts"
$overview     = ".\FrontEnd\App_Principal\src\components\scada\pages\OverviewGrid.tsx"

foreach ($f in @($tanksBackend,$pumpsBackend,$usePlant,$overview)) {
  if (!(Test-Path $f)) { throw "No encuentro $f" }
}

function Save-Utf8([string]$path,[string]$content) {
  $enc = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($path,$content,$enc)
}

Write-Host "Aplicando V18.54 - fix orden real desde DB..." -ForegroundColor Cyan

# ============================================================
# 1) Backend: garantizar location_display_order en ambas APIs
# ============================================================

$t = [System.IO.File]::ReadAllText($tanksBackend)

if ($t -notmatch 'location_display_order') {
  $t = [regex]::Replace(
    $t,
    '(l\.service_type\s+as\s+service_type,)',
    '$1' + "`r`n" + '      l.display_order as location_display_order,',
    1,
    [System.Text.RegularExpressions.RegexOptions]::IgnoreCase
  )

  $t = [regex]::Replace(
    $t,
    '("location_name"\s*:\s*r\.get\("location_name"\),)',
    '$1' + "`r`n" + '                "location_display_order": int(r["location_display_order"]) if r.get("location_display_order") is not None else 999,',
    1
  )

  Save-Utf8 $tanksBackend $t
}

$p = [System.IO.File]::ReadAllText($pumpsBackend)

if ($p -notmatch 'location_display_order') {
  $p = [regex]::Replace(
    $p,
    '(l\.service_type\s+AS\s+service_type,)',
    '$1' + "`r`n" + '      l.display_order AS location_display_order,',
    1,
    [System.Text.RegularExpressions.RegexOptions]::IgnoreCase
  )

  $p = [regex]::Replace(
    $p,
    '("location_name"\s*:\s*r\["location_name"\],)',
    '$1' + "`r`n" + '                "location_display_order": int(r["location_display_order"]) if r.get("location_display_order") is not None else 999,',
    1
  )

  Save-Utf8 $pumpsBackend $p
}

# ============================================================
# 2) usePlant: preservar el campo en Tank/Pump
# ============================================================

$u = [System.IO.File]::ReadAllText($usePlant)

# Tipos
if ($u -notmatch 'location_display_order\?:') {
  $u = [regex]::Replace(
    $u,
    '(\s+location_name\?: string \| null;)',
    '$1' + "`r`n" + '  location_display_order?: number | null;',
    2
  )
}

# mapTanks y mapPumps: insertar en el objeto retornado justo luego de location_name
if ($u -notmatch 'location_display_order:\s*toNumNullable') {
  $u = [regex]::Replace(
    $u,
    '(\s+location_name,)',
    '$1' + "`r`n" + '      location_display_order: toNumNullable(r.location_display_order),',
    2
  )
}

Save-Utf8 $usePlant $u

# ============================================================
# 3) OverviewGrid: reemplazar SORT alfabetico por sort DB
#    sin depender de Group.displayOrder.
# ============================================================

$o = [System.IO.File]::ReadAllText($overview)

$sortPattern = '(?s)list\.sort\(\(a,\s*b\)\s*=>\s*\{.*?return\s+a\.groupName\.localeCompare\(b\.groupName,\s*"es",\s*\{\s*sensitivity:\s*"base"\s*\}\);\s*\}\);'

$sortReplacement = @'
list.sort((a, b) => {
      const an = a.locId == null;
      const bn = b.locId == null;
      if (an !== bn) return an ? 1 : -1;

      const orderOf = (g: Group) => {
        const values = g.items
          .map((it) => Number((it.obj as any)?.location_display_order))
          .filter((v) => Number.isFinite(v));

        return values.length ? Math.min(...values) : 999;
      };

      const ao = orderOf(a);
      const bo = orderOf(b);

      if (ao !== bo) return ao - bo;

      return a.groupName.localeCompare(b.groupName, "es", { sensitivity: "base" });
    });
'@

$rxSort = New-Object System.Text.RegularExpressions.Regex(
  $sortPattern,
  [System.Text.RegularExpressions.RegexOptions]::Singleline
)

$newO = $rxSort.Replace($o,$sortReplacement,1)

if ($newO -eq $o) {
  throw "No pude encontrar el sort alfabetico actual en OverviewGrid.tsx"
}

Save-Utf8 $overview $newO

Write-Host ""
Write-Host "V18.54 aplicado." -ForegroundColor Green
Write-Host ""
Write-Host "Este fix NO usa el nombre para ordenar." -ForegroundColor Cyan
Write-Host "Lee location_display_order de cada tanque/bomba, que viene de public.locations.display_order." -ForegroundColor Cyan
Write-Host ""
Write-Host "Orden esperado:"
Write-Host "1 IIITK"
Write-Host "2 TK HORMIGON"
Write-Host "3 TK PULMON"
Write-Host "4 TK 1000"
Write-Host "5 Confluencia 1"
Write-Host "6 Confluencia 2"
Write-Host "7 Bombeo Viejo"
Write-Host "8 Planta Nueva"
Write-Host ""
Write-Host "IMPORTANTE: como cambia backend, luego commit + push." -ForegroundColor Yellow
Write-Host ""
Write-Host "Proba:"
Write-Host "cd FrontEnd\App_Principal"
Write-Host "npm run build"
