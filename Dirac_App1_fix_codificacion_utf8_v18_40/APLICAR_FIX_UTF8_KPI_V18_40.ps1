$ErrorActionPreference = "Stop"
$front = ".\FrontEnd\App_1"
if (!(Test-Path $front)) { throw "No encuentro $front. Ejecutá desde la raíz de DiracInstrumentacion." }

Write-Host "Aplicando V18.40 - limpieza UTF-8 en App_1..." -ForegroundColor Cyan

$map = [ordered]@{
"ÃƒÂ¡"="á";"ÃƒÂ©"="é";"ÃƒÂ­"="í";"ÃƒÂ³"="ó";"ÃƒÂº"="ú";"ÃƒÂ±"="ñ";
"Ã¡"="á";"Ã©"="é";"Ã­"="í";"Ã³"="ó";"Ãº"="ú";"Ã±"="ñ";
"Ã"="Á";"Ã‰"="É";"Ã"="Í";"Ã“"="Ó";"Ãš"="Ú";"Ã‘"="Ñ";
"Â¿"="¿";"Â¡"="¡";"Â°"="°";"Âº"="º";"Â·"="·";"Â "=" ";
"â€“"="–";"â€”"="—";"â†’"="→";"â†"="←";"â‰¤"="≤";"â‰¥"="≥";"â‰ˆ"="≈";"â€¢"="•";
"OperaciÃ³n"="Operación";"operaciÃ³n"="operación";
"UbicaciÃ³n"="Ubicación";"ubicaciÃ³n"="ubicación";
"GestiÃ³n"="Gestión";"gestiÃ³n"="gestión";
"administraciÃ³n"="administración";
"DistribuciÃ³n"="Distribución";"distribuciÃ³n"="distribución";
"ImpulsiÃ³n"="Impulsión";"impulsiÃ³n"="impulsión";
"crÃ­tico"="crítico";"CrÃ­tico"="Crítico";
"mÃ¡ximo"="máximo";"MÃ¡ximo"="Máximo";
"mÃ­nimo"="mínimo";"MÃ­nimo"="Mínimo";
"comunicaciÃ³n"="comunicación";"actualizaciÃ³n"="actualización";
"selecciÃ³n"="selección";"comparaciÃ³n"="comparación";
"energÃ©tica"="energética";"elÃ©ctrico"="eléctrico";"ElÃ©ctrico"="Eléctrico";
"hidrÃ¡ulico"="hidráulico";"HidrÃ¡ulico"="Hidráulico";
"anÃ¡lisis"="análisis";"AnÃ¡lisis"="Análisis";
"atenciÃ³n"="atención";"AtenciÃ³n"="Atención";
"mediciÃ³n"="medición";"MediciÃ³n"="Medición";
"estÃ¡"="está";"estÃ¡n"="están";"podÃ©s"="podés";"quÃ©"="qué";"cÃ³mo"="cómo";
"mÃ¡s"="más";"Ãºltimo"="último";"Ãºltima"="última";"Ãºltimas"="últimas";
"perÃ­odo"="período";"perÃ­odos"="períodos"
}

$patterns = @("*.ts","*.tsx","*.js","*.jsx","*.css","*.html","*.json")
$files = foreach ($p in $patterns) {
  Get-ChildItem $front -Recurse -File -Filter $p | Where-Object {
    $_.FullName -notmatch '\\node_modules\\|\\dist\\|\\.next\\'
  }
}

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$changed = 0
$repl = 0

foreach ($file in $files) {
  $txt = [System.IO.File]::ReadAllText($file.FullName)
  $orig = $txt
  for ($pass=0; $pass -lt 3; $pass++) {
    $before = $txt
    foreach ($k in $map.Keys) {
      if ($txt.Contains($k)) {
        $repl += ([regex]::Matches($txt,[regex]::Escape($k))).Count
        $txt = $txt.Replace($k,$map[$k])
      }
    }
    if ($txt -eq $before) { break }
  }
  if ($txt -ne $orig) {
    [System.IO.File]::WriteAllText($file.FullName,$txt,$utf8NoBom)
    $changed++
    Write-Host "Corregido: $($file.FullName)" -ForegroundColor DarkGray
  }
}

$index = Join-Path $front "index.html"
if (Test-Path $index) {
  $html = [System.IO.File]::ReadAllText($index)
  $orig = $html
  if ($html -notmatch '(?i)<meta\s+charset=') {
    $html = $html -replace '(?i)<head>', "<head>`r`n    <meta charset=`"UTF-8`" />"
  }
  if ($html -ne $orig) {
    [System.IO.File]::WriteAllText($index,$html,$utf8NoBom)
    $changed++
  }
}

Write-Host ""
Write-Host "V18.40 terminado. Archivos modificados: $changed | Reemplazos: $repl" -ForegroundColor Green
Write-Host "Ahora:" -ForegroundColor Yellow
Write-Host "cd FrontEnd\App_1"
Write-Host "npm run build"
