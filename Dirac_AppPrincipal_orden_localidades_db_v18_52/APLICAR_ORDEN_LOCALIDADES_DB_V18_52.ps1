$ErrorActionPreference = "Stop"

$tanksBackend = ".\Backend\app\routes\tanks.py"
$pumpsBackend = ".\Backend\app\routes\pumps.py"
$usePlant     = ".\FrontEnd\App_Principal\src\components\scada\hooks\usePlant.ts"
$overview     = ".\FrontEnd\App_Principal\src\components\scada\pages\OverviewGrid.tsx"

foreach ($f in @($tanksBackend,$pumpsBackend,$usePlant,$overview)) {
  if (!(Test-Path $f)) { throw "No encuentro $f" }
}

$enc = New-Object System.Text.UTF8Encoding($false)
function Save([string]$p,[string]$s) { [System.IO.File]::WriteAllText($p,$s,$enc) }

Write-Host "Aplicando V18.52..." -ForegroundColor Cyan

$t = [System.IO.File]::ReadAllText($tanksBackend)
if ($t -notmatch 'location_display_order') {
  $t = $t.Replace('      l.service_type as service_type,','      l.service_type as service_type,' + "`r`n" + '      l.display_order as location_display_order,')
  $t = $t.Replace('                "location_name": r.get("location_name"),','                "location_name": r.get("location_name"),' + "`r`n" + '                "location_display_order": int(r["location_display_order"]) if r.get("location_display_order") is not None else 999,')
  Save $tanksBackend $t
}

$p = [System.IO.File]::ReadAllText($pumpsBackend)
if ($p -notmatch 'location_display_order') {
  $p = $p.Replace('      l.service_type AS service_type,','      l.service_type AS service_type,' + "`r`n" + '      l.display_order AS location_display_order,')
  $p = $p.Replace('                "location_name": r["location_name"],','                "location_name": r["location_name"],' + "`r`n" + '                "location_display_order": int(r["location_display_order"]) if r.get("location_display_order") is not None else 999,')
  Save $pumpsBackend $p
}

$u = [System.IO.File]::ReadAllText($usePlant)
if ($u -notmatch 'location_display_order') {
  $u = [regex]::Replace($u,'(\s+location_name\?: string \| null;)','$1' + "`r`n" + '  location_display_order?: number | null;',2)
  $u = [regex]::Replace($u,'(const location_name = r\.location_name \?\? null;)','$1' + "`r`n" + '    const location_display_order = toNumNullable(r.location_display_order);',2)
  $u = [regex]::Replace($u,'(\s+location_name,)','$1' + "`r`n" + '      location_display_order,',2)
  Save $usePlant $u
}

$o = [System.IO.File]::ReadAllText($overview)
if ($o -notmatch 'displayOrder:\s*number') {
  $o = $o.Replace('  groupCode?: string | null;','  groupCode?: string | null;' + "`r`n" + '  displayOrder: number;')
}
if ($o -notmatch 'displayOrder: number = 999') {
  $o = $o.Replace('      serviceType: ServiceType = "agua"' + "`r`n" + '    ): Group => {','      serviceType: ServiceType = "agua",' + "`r`n" + '      displayOrder: number = 999' + "`r`n" + '    ): Group => {')
}
if ($o -notmatch 'groupCode: code \?\? undefined,\s*displayOrder') {
  $o = $o.Replace('          groupCode: code ?? undefined,','          groupCode: code ?? undefined,' + "`r`n" + '          displayOrder,')
}

$tankBlock = '(?s)(\(plant\?\.tanks \?\? \[\]\)\.forEach\(\(t: any\) => \{.*?)(const g = ensureGroup\(locId, locName, link\?\.code \?\? undefined, serviceType\);)'
$o = [regex]::Replace($o,$tankBlock,'$1const g = ensureGroup(locId, locName, link?.code ?? undefined, serviceType, Number((t as any).location_display_order ?? 999));',1)
$pumpBlock = '(?s)(\(plant\?\.pumps \?\? \[\]\)\.forEach\(\(p: any\) => \{.*?)(const g = ensureGroup\(locId, locName, link\?\.code \?\? undefined, serviceType\);)'
$o = [regex]::Replace($o,$pumpBlock,'$1const g = ensureGroup(locId, locName, link?.code ?? undefined, serviceType, Number((p as any).location_display_order ?? 999));',1)

$sortOld = @'
    list.sort((a, b) => {
      const an = a.locId == null;
      const bn = b.locId == null;
      if (an !== bn) return an ? 1 : -1;
      return a.groupName.localeCompare(b.groupName, "es", { sensitivity: "base" });
    });
'@
$sortNew = @'
    list.sort((a, b) => {
      const an = a.locId == null;
      const bn = b.locId == null;
      if (an !== bn) return an ? 1 : -1;
      const ao = Number(a.displayOrder ?? 999);
      const bo = Number(b.displayOrder ?? 999);
      if (ao !== bo) return ao - bo;
      return a.groupName.localeCompare(b.groupName, "es", { sensitivity: "base" });
    });
'@
if ($o.Contains($sortOld)) { $o = $o.Replace($sortOld,$sortNew) }
Save $overview $o

Write-Host "" 
Write-Host "V18.52 aplicado." -ForegroundColor Green
Write-Host "El orden ahora sale de public.locations.display_order." -ForegroundColor Green
Write-Host "Los nombres ya fueron limpiados en Supabase." -ForegroundColor Green
Write-Host "" 
Write-Host "Proba:" -ForegroundColor Yellow
Write-Host "cd FrontEnd\App_Principal"
Write-Host "npm run build"
