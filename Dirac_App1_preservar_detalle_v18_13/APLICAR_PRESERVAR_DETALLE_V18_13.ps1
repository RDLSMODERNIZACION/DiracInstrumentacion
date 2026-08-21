$ErrorActionPreference = "Stop"

$path = ".\FrontEnd\App_1\src\widget\index.tsx"

if (!(Test-Path $path)) {
    throw "No encuentro $path. Ejecutá desde la raíz de DiracInstrumentacion."
}

$txt = Get-Content $path -Raw

Write-Host "Aplicando V18.13 - ocultar solo selectores y preservar detalle..." -ForegroundColor Cyan

# ============================================================
# 1) Ocultar SOLO la franja superior de selector Ubicación / badges.
#    No borramos JSX: cambiamos la clase del primer bloque superior
#    por hidden para evitar romper estructura.
# ============================================================
$returnPos = $txt.IndexOf("  return (")
if ($returnPos -lt 0) {
    throw "No encontré el return principal."
}

$topClass = '<div className="flex flex-wrap items-center gap-4">'
$topPos = $txt.IndexOf($topClass, $returnPos)

if ($topPos -ge 0) {
    $txt = $txt.Substring(0, $topPos) +
           '<div className="hidden">' +
           $txt.Substring($topPos + $topClass.Length)
} else {
    Write-Host "Aviso: la franja superior ya no está o ya fue modificada." -ForegroundColor Yellow
}

# ============================================================
# 2) Ocultar SOLO BaseSelectors de Tanques/Bombas.
#    Mantener toda la lógica y datos internos.
# ============================================================
$oldCondition = '{(pumpOptions.length > 0 || tankOptions.length > 0) && ('
$newCondition = '{false && (pumpOptions.length > 0 || tankOptions.length > 0) && ('

if ($txt.Contains($oldCondition)) {
    $txt = $txt.Replace($oldCondition, $newCondition)
} elseif ($txt.Contains($newCondition)) {
    Write-Host "BaseSelectors ya estaba oculto." -ForegroundColor Yellow
} else {
    Write-Host "Aviso: no encontré el bloque BaseSelectors; continúo sin tocar el detalle." -ForegroundColor Yellow
}

# ============================================================
# 3) Validar que el resumen nuevo siga presente.
# ============================================================
if ($txt -notmatch 'WaterNetworkOverviewLive') {
    Write-Host "Aviso: no encontré WaterNetworkOverviewLive en index.tsx." -ForegroundColor Yellow
}

Set-Content $path $txt -Encoding UTF8

Write-Host ""
Write-Host "V18.13 aplicado correctamente." -ForegroundColor Green
Write-Host "Se ocultan únicamente:" -ForegroundColor Green
Write-Host "- selector de Ubicación / badges superiores"
Write-Host "- selector grande de Tanques/Bombas"
Write-Host ""
Write-Host "Se conserva:" -ForegroundColor Cyan
Write-Host "- gráfico de Impulsión"
Write-Host "- gráfico de Distribución"
Write-Host "- detalle de bombas por localidad"
Write-Host "- detalle de tanques por localidad"
