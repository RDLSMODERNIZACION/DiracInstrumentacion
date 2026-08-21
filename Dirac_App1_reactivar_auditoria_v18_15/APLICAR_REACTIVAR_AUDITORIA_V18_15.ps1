$ErrorActionPreference = "Stop"

$path = ".\FrontEnd\App_1\src\widget\index.tsx"

if (!(Test-Path $path)) {
    throw "No encuentro $path. Ejecutá desde la raíz de DiracInstrumentacion."
}

$txt = Get-Content $path -Raw

Write-Host "Aplicando V18.15 - reactivar Auditoría debajo del resumen..." -ForegroundColor Cyan

# ============================================================
# Idea:
# - conservar WaterNetworkOverviewLive como vista principal
# - conservar detalle bombas/tanques debajo
# - recuperar SOLO el bloque de Auditoría comparativa
# - no reactivar Eventos ni Resumen por ubicación
# ============================================================

$marker = '{/* V18.15 AUDITORIA */}'

if ($txt.Contains($marker)) {
    Write-Host "La auditoría V18.15 ya está insertada." -ForegroundColor Yellow
    Set-Content $path $txt -Encoding UTF8
    exit 0
}

# ------------------------------------------------------------
# 1) Encontrar el bloque viejo de Auditoría comparativa
# ------------------------------------------------------------
$auditStartText = '<section>' + [Environment]::NewLine + '            <Card className="rounded-2xl border-blue-200 bg-blue-50/40">'

$auditTitlePos = $txt.IndexOf('Auditoría comparativa')
if ($auditTitlePos -lt 0) {
    throw "No encontré el bloque 'Auditoría comparativa' en index.tsx."
}

# Buscar el <section> inmediatamente anterior
$sectionStart = $txt.LastIndexOf('<section>', $auditTitlePos)
if ($sectionStart -lt 0) {
    throw "No pude localizar el inicio de la sección de Auditoría."
}

# Buscar cierre de esa sección antes del bloque siguiente.
# El siguiente bloque suele comenzar con {auditEnabled && (
$nextMarker = $txt.IndexOf('{auditEnabled && (', $auditTitlePos)

if ($nextMarker -lt 0) {
    throw "No pude localizar el bloque de comparación asociado a Auditoría."
}

# El cierre de la primera tarjeta está justo antes del siguiente bloque condicional.
$sectionEnd = $txt.LastIndexOf('</section>', $nextMarker)
if ($sectionEnd -lt $sectionStart) {
    throw "No pude localizar el cierre de la sección de Auditoría."
}
$sectionEnd += '</section>'.Length

$auditHeaderSection = $txt.Substring($sectionStart, $sectionEnd - $sectionStart)

# ------------------------------------------------------------
# 2) Capturar también la comparación directa condicional
# ------------------------------------------------------------
$compareStart = $nextMarker

# Buscar el próximo bloque que ya NO pertenece a auditoría.
# En la versión original después venían eventos operativos.
$eventsPos = $txt.IndexOf('<OperationEventFeed', $compareStart)

if ($eventsPos -lt 0) {
    # fallback: buscar Resumen por ubicación
    $eventsPos = $txt.IndexOf('Resumen por ubicación', $compareStart)
}

if ($eventsPos -lt 0) {
    throw "No pude determinar dónde termina la sección de Auditoría."
}

# Buscar hacia atrás el cierre del bloque condicional anterior:
# normalmente termina en )}
$compareEnd = $txt.LastIndexOf(')}', $eventsPos)
if ($compareEnd -lt $compareStart) {
    throw "No pude localizar el final de Comparación directa."
}
$compareEnd += 2

$auditCompareBlock = $txt.Substring($compareStart, $compareEnd - $compareStart)

# ------------------------------------------------------------
# 3) Insertar auditoría DESPUÉS del nuevo resumen V18.14
# ------------------------------------------------------------
$newOverviewCloseSearch = '<WaterNetworkOverviewLive'
$newOverviewPos = $txt.IndexOf($newOverviewCloseSearch)

if ($newOverviewPos -lt 0) {
    throw "No encontré WaterNetworkOverviewLive."
}

# Buscar el cierre del bloque activo:
#     />
#   )}
$blockEnd = $txt.IndexOf('      )}', $newOverviewPos)
if ($blockEnd -lt 0) {
    throw "No encontré el cierre del bloque WaterNetworkOverviewLive."
}
$blockEnd += '      )}'.Length

$insert = @'


      {/* V18.15 AUDITORIA */}
'@ + $auditHeaderSection + @'


'@ + $auditCompareBlock + @'


'@

$txt = $txt.Insert($blockEnd, $insert)

Set-Content $path $txt -Encoding UTF8

Write-Host ""
Write-Host "V18.15 aplicado correctamente." -ForegroundColor Green
Write-Host ""
Write-Host "Se mantiene:" -ForegroundColor Cyan
Write-Host "- gráfico Impulsión"
Write-Host "- gráfico Distribución"
Write-Host "- detalle bombas por localidad"
Write-Host "- detalle tanques por localidad"
Write-Host ""
Write-Host "Y vuelve a aparecer debajo:" -ForegroundColor Green
Write-Host "- Auditoría comparativa"
Write-Host "- Comparación directa cuando se activa"
Write-Host ""
Write-Host "No se reactivan Eventos ni Resumen por ubicación." -ForegroundColor Yellow
