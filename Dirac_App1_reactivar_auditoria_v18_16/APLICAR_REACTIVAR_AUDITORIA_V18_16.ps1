$ErrorActionPreference = "Stop"

$rel = "FrontEnd/App_1/src/widget/index.tsx"
$path = ".\FrontEnd\App_1\src\widget\index.tsx"

if (!(Test-Path $path)) {
    throw "No encuentro $path. Ejecutá desde la raíz de DiracInstrumentacion."
}

Write-Host "Aplicando V18.16 - recuperar Auditoría desde git HEAD..." -ForegroundColor Cyan

$current = Get-Content $path -Raw

if ($current.Contains("V18.16 AUDITORIA")) {
    Write-Host "La Auditoría V18.16 ya está insertada." -ForegroundColor Yellow
    exit 0
}

# ============================================================
# 1) Leer la versión original/commiteada desde Git.
#    Así no dependemos de que el bloque siga existiendo en el archivo local.
# ============================================================
$baseLines = git show "HEAD:$rel"

if ($LASTEXITCODE -ne 0 -or !$baseLines) {
    throw "No pude leer $rel desde git HEAD."
}

$base = ($baseLines -join [Environment]::NewLine)

# ============================================================
# 2) Encontrar el bloque de Auditoría usando texto sin depender
#    de la codificación exacta de la letra í.
# ============================================================
$auditMatch = [regex]::Match(
    $base,
    'Auditor.a comparativa',
    [System.Text.RegularExpressions.RegexOptions]::IgnoreCase
)

if (!$auditMatch.Success) {
    throw "No encontré Auditoría comparativa en la versión de git HEAD."
}

$auditTitlePos = $auditMatch.Index

# Inicio: section inmediatamente anterior
$sectionStart = $base.LastIndexOf("<section", $auditTitlePos)

if ($sectionStart -lt 0) {
    throw "No pude encontrar el inicio de la sección de Auditoría."
}

# Fin: justo antes de Eventos operativos recientes.
$eventsMatch = [regex]::Match(
    $base.Substring($auditTitlePos),
    'OperationEventFeed|Eventos operativos recientes',
    [System.Text.RegularExpressions.RegexOptions]::IgnoreCase
)

if (!$eventsMatch.Success) {
    throw "No pude encontrar el final del bloque de Auditoría en git HEAD."
}

$eventsPos = $auditTitlePos + $eventsMatch.Index

# Retroceder desde Eventos hasta cerrar el bloque condicional anterior.
# Buscamos el último ')}' antes de eventos.
$auditEnd = $base.LastIndexOf(")}", $eventsPos)

if ($auditEnd -lt $sectionStart) {
    throw "No pude determinar el cierre del bloque de Auditoría."
}

$auditEnd += 2
$auditBlock = $base.Substring($sectionStart, $auditEnd - $sectionStart)

# ============================================================
# 3) Insertar la auditoría DESPUÉS de WaterNetworkOverviewLive.
# ============================================================
$overviewPos = $current.IndexOf("<WaterNetworkOverviewLive")

if ($overviewPos -lt 0) {
    throw "No encontré WaterNetworkOverviewLive en el archivo actual."
}

# Cierre del bloque activo:
# ... <WaterNetworkOverviewLive ... />
# )}
$overviewClose = $current.IndexOf(")}", $overviewPos)

if ($overviewClose -lt 0) {
    throw "No pude encontrar el cierre del bloque WaterNetworkOverviewLive."
}

$overviewClose += 2

$insert = @'


      {/* V18.16 AUDITORIA */}
'@ + $auditBlock + @'


'@

$current = $current.Insert($overviewClose, $insert)

Set-Content $path $current -Encoding UTF8

Write-Host ""
Write-Host "V18.16 aplicado correctamente." -ForegroundColor Green
Write-Host ""
Write-Host "Se conserva:" -ForegroundColor Cyan
Write-Host "- gráficos de Impulsión y Distribución"
Write-Host "- detalle de bombas por localidad"
Write-Host "- detalle de tanques por localidad"
Write-Host ""
Write-Host "Y vuelve debajo:" -ForegroundColor Green
Write-Host "- Auditoría comparativa"
Write-Host "- Comparación directa al activarla"
Write-Host ""
Write-Host "No se reactivan Eventos ni Resumen por ubicación." -ForegroundColor Yellow
