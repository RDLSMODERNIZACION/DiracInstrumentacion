$ErrorActionPreference = "Stop"

$path = ".\FrontEnd\App_1\src\widget\index.tsx"

if (!(Test-Path $path)) {
    throw "No encuentro $path. Ejecutá desde la raíz de DiracInstrumentacion."
}

$txt = Get-Content $path -Raw

$pattern = '(?s)\s*<section className="grid grid-cols-1 gap-4 xl:grid-cols-2">\s*<TankHealthTable items=\{tankHealthRows\} />\s*<PumpHealthTable items=\{pumpHealthRows\} />\s*</section>'

$new = [regex]::Replace($txt, $pattern, '', 1)

if ($new -eq $txt) {
    throw "No encontré el bloque Estado de tanques / Estado de bombas."
}

Set-Content $path $new -Encoding UTF8

Write-Host ""
Write-Host "V18.3 aplicado correctamente." -ForegroundColor Green
Write-Host "Se sacaron del dashboard las tablas Estado de tanques y Estado de bombas." -ForegroundColor Green
