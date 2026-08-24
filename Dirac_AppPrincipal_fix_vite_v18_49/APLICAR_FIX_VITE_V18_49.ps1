$ErrorActionPreference = "Stop"

$overview = ".\FrontEnd\App_Principal\src\components\scada\pages\OverviewGrid.tsx"

if (!(Test-Path $overview)) {
  throw "No encuentro $overview. Ejecuta desde la raiz de DiracInstrumentacion."
}

function Write-Utf8NoBom([string]$path, [string]$content) {
  $enc = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($path, $content, $enc)
}

Write-Host "Aplicando V18.49 - fix JSX Vite..." -ForegroundColor Cyan

$txt = [System.IO.File]::ReadAllText($overview)

# El V18.48 inserto un <style> como hermano del div raiz dentro del return,
# lo que rompe el JSX. Eliminamos todo ese bloque.
$pattern = '(?s)\s*\{/\*\s*V18\.48 RESPONSIVE\s*\*/\}\s*<style>\{`.*?`\}</style>\s*'

$rx = New-Object System.Text.RegularExpressions.Regex(
  $pattern,
  [System.Text.RegularExpressions.RegexOptions]::Singleline
)

$newTxt = $rx.Replace($txt, "`r`n", 1)

if ($newTxt -eq $txt) {
  # Fallback mas directo entre el comentario y </style>
  $start = $txt.IndexOf('{/* V18.48 RESPONSIVE */}')
  if ($start -ge 0) {
    $end = $txt.IndexOf('</style>', $start)
    if ($end -ge 0) {
      $end += '</style>'.Length
      $newTxt = $txt.Substring(0, $start) + $txt.Substring($end)
    }
  }
}

if ($newTxt -eq $txt) {
  Write-Host "No encontre el bloque V18.48; puede que ya este corregido." -ForegroundColor Yellow
} else {
  Write-Utf8NoBom $overview $newTxt
  Write-Host "Bloque JSX invalido eliminado." -ForegroundColor Green
}

Write-Host ""
Write-Host "Ahora proba:" -ForegroundColor Yellow
Write-Host "cd FrontEnd\App_Principal"
Write-Host "npm run build"
