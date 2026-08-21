$ErrorActionPreference = "Stop"

$path = ".\Backend\app\routes\infraestructura\layout.py"

if (!(Test-Path $path)) {
    throw "No encuentro $path. Ejecutá desde la raíz de DiracInstrumentacion."
}

$txt = Get-Content $path -Raw

Write-Host "Aplicando fix robusto V17.14..." -ForegroundColor Cyan

# Buscar solamente la CTE p AS (...) hasta antes de v AS (
$match = [regex]::Match(
    $txt,
    '(?s)(\bp\s+AS\s*\(\s*SELECT.*?)(\n\s*\),\s*\n\s*v\s+AS\s*\()'
)

if (!$match.Success) {
    throw "No pude localizar la CTE p AS (...) en layout.py."
}

$pcte = $match.Groups[1].Value
$suffix = $match.Groups[2].Value

# Agregar orientacion si falta dentro de la CTE p
if ($pcte -notmatch '\bAS\s+orientacion\b') {
    $pcte = [regex]::Replace(
        $pcte,
        '(NULL::text\s+AS\s+categoria\s*,)',
        '$1' + "`r`n                    p.orientacion::text AS orientacion,",
        1
    )
}

# Agregar servicio si falta dentro de la CTE p
if ($pcte -notmatch '\bAS\s+servicio\b') {
    if ($pcte -match '\bAS\s+orientacion\b') {
        $pcte = [regex]::Replace(
            $pcte,
            '(p\.orientacion::text\s+AS\s+orientacion\s*,)',
            '$1' + "`r`n                    p.servicio::text AS servicio,",
            1
        )
    } else {
        $pcte = [regex]::Replace(
            $pcte,
            '(NULL::text\s+AS\s+categoria\s*,)',
            '$1' + "`r`n                    p.servicio::text AS servicio,",
            1
        )
    }
}

if ($pcte -notmatch 'p\.orientacion::text\s+AS\s+orientacion') {
    throw "No pude insertar p.orientacion dentro de la CTE p."
}

if ($pcte -notmatch 'p\.servicio::text\s+AS\s+servicio') {
    throw "No pude insertar p.servicio dentro de la CTE p."
}

$before = $match.Value
$after = $pcte + $suffix

$txt = $txt.Substring(0, $match.Index) + $after + $txt.Substring($match.Index + $match.Length)

Set-Content $path $txt -Encoding UTF8

Write-Host ""
Write-Host "V17.14 aplicado correctamente." -ForegroundColor Green
Write-Host "La CTE de bombas ahora devuelve orientacion y servicio." -ForegroundColor Green
Write-Host ""
Write-Host "Verificación:" -ForegroundColor Yellow
Select-String -Path $path -Pattern "p.orientacion::text AS orientacion","p.servicio::text AS servicio"
