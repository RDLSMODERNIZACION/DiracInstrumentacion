$ErrorActionPreference = "Stop"

$path = ".\FrontEnd\App_1\src\components\red\WaterNetworkOverviewLive.tsx"

if (!(Test-Path $path)) {
    throw "No encuentro $path. Ejecutá desde la raíz de DiracInstrumentacion."
}

$txt = Get-Content $path -Raw

Write-Host "Aplicando V18.29 - simplificar popup de bombas..." -ForegroundColor Cyan

# 1) En el popup, dejamos solamente:
# - Bombas ON
# - Disponibles
# - Encendidas en este minuto
# y sacamos:
# - Bombas OFF
# - Sin comunicación
# - Apagadas

$txt = $txt.Replace("Bombas OFF", "Disponibles")
$txt = $txt.Replace("Online", "Disponibles")

# Bloques secundarios que no interesan más
$patterns = @(
    '(?s)\s*<[^>]*>\s*Sin comunicación\s*</[^>]*>\s*<[^>]*>\s*\{[^}]+\}\s*</[^>]*>\s*</[^>]*>',
    '(?s)\s*<[^>]*>\s*Apagadas\s*·\s*\{[^}]+\}\s*</[^>]*>.*?No hay detalle de bombas apagadas\..*?</[^>]*>',
    '(?s)\s*<[^>]*>\s*Bombas OFF\s*</[^>]*>\s*<[^>]*>\s*\{[^}]+\}\s*</[^>]*>\s*</[^>]*>'
)

foreach ($pattern in $patterns) {
    $txt = [regex]::Replace($txt, $pattern, "", [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
}

# Si existe el mensaje de "Apagadas", lo quitamos de forma adicional
$txt = $txt.Replace("Sin detalle de bombas apagadas.", "")
$txt = $txt.Replace("No hay detalle de bombas apagadas.", "")

# Ajustes de texto más claros
$txt = $txt.Replace("Encendidas en este minuto", "Bombas encendidas en este minuto")
$txt = $txt.Replace("No hay detalle de bombas encendidas para este minuto.", "No hay bombas encendidas registradas para este minuto.")

# Texto de resumen
$txt = $txt.Replace("Uso:", "Encendidas:")
$txt = $txt.Replace("Comunicación:", "Disponibles:")

Set-Content $path $txt -Encoding UTF8

Write-Host ""
Write-Host "V18.29 aplicado." -ForegroundColor Green
Write-Host "Popup de bombas simplificado a:" -ForegroundColor Green
Write-Host "- Cantidad encendidas" -ForegroundColor Yellow
Write-Host "- Cantidad disponibles" -ForegroundColor Yellow
Write-Host "- Lista de bombas encendidas" -ForegroundColor Yellow
Write-Host ""
Write-Host "Si querés después hacemos una V18.30 para que 'Disponibles' salga desde la disponibilidad manual de la base y no desde online/comunicación." -ForegroundColor Cyan
