$ErrorActionPreference = "Stop"

$overview = ".\FrontEnd\App_Principal\src\components\scada\pages\OverviewGrid.tsx"

if (!(Test-Path $overview)) {
  throw "No encuentro $overview. Ejecuta desde la raiz de DiracInstrumentacion."
}

function Write-Utf8NoBom([string]$path, [string]$content) {
  $enc = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($path, $content, $enc)
}

Write-Host "Aplicando V18.50 - quitar etiqueta Agua/Cloacas del grupo..." -ForegroundColor Cyan

$txt = [System.IO.File]::ReadAllText($overview)
$original = $txt

# Quita la pastilla del encabezado de cada grupo:
# {g.serviceType === "cloacas" ? "Cloacas" : "Agua"}
$pattern = '(?s)\s*<span\s+className="[^"]*"\s+style=\{\{\s*background:\s*acc\.pillBg,\s*borderColor:\s*acc\.pillBd,\s*color:\s*acc\.pillTx\s*\}\}\s*>\s*\{g\.serviceType === "cloacas" \? "Cloacas" : "Agua"\}\s*</span>'

$rx = New-Object System.Text.RegularExpressions.Regex(
  $pattern,
  [System.Text.RegularExpressions.RegexOptions]::Singleline
)

$txt = $rx.Replace($txt, "", 1)

# Fallback mas tolerante por contenido.
if ($txt -eq $original) {
  $pattern2 = '(?s)<span[^>]*>\s*\{g\.serviceType === "cloacas" \? "Cloacas" : "Agua"\}\s*</span>'
  $rx2 = New-Object System.Text.RegularExpressions.Regex(
    $pattern2,
    [System.Text.RegularExpressions.RegexOptions]::Singleline
  )
  $txt = $rx2.Replace($txt, "", 1)
}

if ($txt -eq $original) {
  Write-Host "No encontre la etiqueta dentro del grupo. Puede que ya este quitada." -ForegroundColor Yellow
} else {
  Write-Utf8NoBom $overview $txt
  Write-Host "Etiqueta Agua/Cloacas eliminada del encabezado del grupo." -ForegroundColor Green
}

Write-Host ""
Write-Host "El selector superior de Servicio se mantiene." -ForegroundColor Cyan
Write-Host ""
Write-Host "Proba:" -ForegroundColor Yellow
Write-Host "cd FrontEnd\App_Principal"
Write-Host "npm run build"
