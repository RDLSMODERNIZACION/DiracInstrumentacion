$ErrorActionPreference = "Stop"

$front = ".\FrontEnd\App_1"

if (!(Test-Path $front)) {
    throw "No encuentro $front. Ejecuta este script desde la raiz de DiracInstrumentacion."
}

Write-Host "Aplicando V18.41 - reparacion robusta UTF-8 en App_1..." -ForegroundColor Cyan

# Solo ASCII en el script para evitar que PowerShell mismo se rompa por encoding.
$utf8 = New-Object System.Text.UTF8Encoding($false, $false)
$cp1252 = [System.Text.Encoding]::GetEncoding(1252)

function Get-SuspiciousScore([string]$s) {
    if ($null -eq $s) { return 0 }

    $score = 0

    # Caracteres tipicos de UTF-8 interpretado como Windows-1252:
    # U+00C3, U+00C2, U+00E2 y replacement U+FFFD.
    foreach ($code in @(0x00C3, 0x00C2, 0x00E2, 0xFFFD)) {
        $ch = [char]$code
        $score += ([regex]::Matches($s, [regex]::Escape([string]$ch))).Count
    }

    # Secuencias de control C1 suelen aparecer en mojibake.
    foreach ($c in $s.ToCharArray()) {
        $n = [int][char]$c
        if ($n -ge 0x80 -and $n -le 0x9F) {
            $score += 2
        }
    }

    return $score
}

function Repair-Line([string]$line) {
    if ([string]::IsNullOrEmpty($line)) { return $line }

    $current = $line

    for ($pass = 0; $pass -lt 3; $pass++) {
        $beforeScore = Get-SuspiciousScore $current
        if ($beforeScore -le 0) { break }

        try {
            $bytes = $cp1252.GetBytes($current)
            $candidate = $utf8.GetString($bytes)
        }
        catch {
            break
        }

        $afterScore = Get-SuspiciousScore $candidate

        # Solo aceptar si realmente mejora.
        if ($afterScore -lt $beforeScore) {
            $current = $candidate
        }
        else {
            break
        }
    }

    return $current
}

$patterns = @("*.ts","*.tsx","*.js","*.jsx","*.css","*.html","*.json")
$files = @()

foreach ($pattern in $patterns) {
    $files += Get-ChildItem $front -Recurse -File -Filter $pattern |
        Where-Object {
            $_.FullName -notmatch '\\node_modules\\' -and
            $_.FullName -notmatch '\\dist\\' -and
            $_.FullName -notmatch '\\.next\\'
        }
}

$changedFiles = @()
$changedLines = 0

foreach ($file in $files) {
    $text = [System.IO.File]::ReadAllText($file.FullName)
    $original = $text

    # Preservar saltos de linea de forma simple.
    $newline = if ($text.Contains("`r`n")) { "`r`n" } else { "`n" }
    $lines = [regex]::Split($text, "\r?\n")

    for ($i = 0; $i -lt $lines.Length; $i++) {
        $fixed = Repair-Line $lines[$i]
        if ($fixed -ne $lines[$i]) {
            $lines[$i] = $fixed
            $changedLines++
        }
    }

    $newText = [string]::Join($newline, $lines)

    if ($newText -ne $original) {
        [System.IO.File]::WriteAllText($file.FullName, $newText, $utf8)
        $changedFiles += $file.FullName
        Write-Host ("Corregido: " + $file.FullName) -ForegroundColor DarkGray
    }
}

# Asegurar charset UTF-8 en index.html.
$indexHtml = Join-Path $front "index.html"
if (Test-Path $indexHtml) {
    $html = [System.IO.File]::ReadAllText($indexHtml)

    if ($html -notmatch '(?i)<meta\s+charset=') {
        $html = $html -replace '(?i)<head>', '<head><meta charset="UTF-8" />'
        [System.IO.File]::WriteAllText($indexHtml, $html, $utf8)

        if ($changedFiles -notcontains $indexHtml) {
            $changedFiles += $indexHtml
        }
    }
}

Write-Host ""
Write-Host "V18.41 finalizado correctamente." -ForegroundColor Green
Write-Host ("Archivos modificados: " + $changedFiles.Count) -ForegroundColor Cyan
Write-Host ("Lineas reparadas: " + $changedLines) -ForegroundColor Cyan
Write-Host ""
Write-Host "Ahora ejecuta:" -ForegroundColor Yellow
Write-Host "cd FrontEnd\App_1"
Write-Host "npm run build"
