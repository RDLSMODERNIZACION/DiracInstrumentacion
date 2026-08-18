$ErrorActionPreference = "Stop"

$repo = Get-Location
$infra = Join-Path $repo "FrontEnd\App_2\src\features\infra-diagram\InfraDiagram.tsx"

if (!(Test-Path $infra)) {
    throw "No encuentro InfraDiagram.tsx. Ejecuta este script desde la raiz de DiracInstrumentacion."
}

$i = Get-Content $infra -Raw

Write-Host "Desactivando el panel de localidad..." -ForegroundColor Cyan

# 1) Quitar click sobre los fondos de localidad
$oldClick = @"
                    style={{ cursor: "pointer" }}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleLocationClick(g);
                    }}
"@

$newClick = @"
                    style={{ cursor: "default" }}
"@

if ($i.Contains($oldClick)) {
    $i = $i.Replace($oldClick, $newClick)
}

# Variante con CRLF/LF flexible
$i = $i.Replace('style={{ cursor: "pointer" }}', 'style={{ cursor: "default" }}')

# 2) Eliminar el render del LocationDrawer al final
$drawerPattern = @"
      <LocationDrawer
        open={locationDrawerOpen}
        onClose={() => {
          setLocationDrawerOpen(false);
          setSelectedLocation(null);
        }}
        location={selectedLocation}
      />
"@

if ($i.Contains($drawerPattern)) {
    $i = $i.Replace($drawerPattern, "")
}

# 3) También neutralizar cualquier llamada residual al abrirlo
$i = $i.Replace('setLocationDrawerOpen(true);', '/* LocationDrawer desactivado */')
$i = $i.Replace('setLocationDrawerOpen(false);', '/* LocationDrawer desactivado */')

Set-Content $infra $i -Encoding UTF8

Write-Host ""
Write-Host "Listo. Ya no se abre el panel 'Localidad' al tocar el mapa." -ForegroundColor Green
Write-Host "No se modifico Supabase." -ForegroundColor Green
Write-Host ""
Write-Host "Ahora:"
Write-Host "  cd FrontEnd\App_2"
Write-Host "  npm run dev"
