$ErrorActionPreference = "Stop"

$path = ".\FrontEnd\App_1\src\widget\index.tsx"

if (!(Test-Path $path)) {
    throw "No encuentro $path. Ejecutá desde la raíz de DiracInstrumentacion."
}

$txt = Get-Content $path -Raw

Write-Host "Aplicando V18.32 - filtro Impulsión en tabla de confiabilidad..." -ForegroundColor Cyan

# ============================================================
# 1) State del filtro
# ============================================================
if ($txt -notmatch 'confiabilidadFiltroBombas') {
    $anchor = '  const [principalPumpIds, setPrincipalPumpIds] = useState<number[]>([]);'
    $pos = $txt.IndexOf($anchor)
    if ($pos -lt 0) {
        throw "No encontré principalPumpIds. Aplicá antes la versión con roles dinámicos."
    }

    $insertPos = $txt.IndexOf([Environment]::NewLine, $pos)
    $insertPos += [Environment]::NewLine.Length

    $state = '  const [confiabilidadFiltroBombas, setConfiabilidadFiltroBombas] = useState<"todas" | "impulsion">("impulsion");' + [Environment]::NewLine
    $txt = $txt.Insert($insertPos, $state)
}

# ============================================================
# 2) Cálculo de pump ids para confiabilidad
# ============================================================
if ($txt -notmatch 'const reliabilityPumpIds =') {
    $anchor = '  const operationTankIds ='
    $pos = $txt.IndexOf($anchor)
    if ($pos -lt 0) {
        throw "No encontré operationTankIds."
    }

    # buscar final del bloque operationTankIds;
    $end = $txt.IndexOf(';' + [Environment]::NewLine, $pos)
    if ($end -lt 0) {
        throw "No pude ubicar el final de operationTankIds."
    }
    $end += 2 + [Environment]::NewLine.Length

    $calc = @'
  const reliabilityPumpIds =
    tab === "confiabilidad" &&
    confiabilidadFiltroBombas === "impulsion" &&
    principalPumpIds.length > 0
      ? principalPumpIds
      : selectedPumpIds;

'@

    $txt = $txt.Insert($end, $calc)
}

# ============================================================
# 3) Reemplazar selectedPumpIds del ReliabilityPage
# ============================================================
$oldProp = 'selectedPumpIds={selectedPumpIds}'
$newProp = 'selectedPumpIds={reliabilityPumpIds}'
if ($txt.Contains($oldProp)) {
    $txt = $txt.Replace($oldProp, $newProp)
} elseif ($txt -notmatch 'selectedPumpIds=\{reliabilityPumpIds\}') {
    throw "No encontré selectedPumpIds del ReliabilityPage."
}

# ============================================================
# 4) Insertar UI de filtro en la pestaña confiabilidad
# ============================================================
$marker = '{/* V18.32 FILTRO IMPULSION CONFIABILIDAD */}'
if ($txt -notmatch [regex]::Escape($marker)) {
    $anchor = '{tab === "confiabilidad" && ('
    $start = $txt.IndexOf($anchor)
    if ($start -lt 0) {
        throw "No encontré el inicio del bloque de confiabilidad."
    }

    # Buscar el primer <ReliabilityPage dentro de ese bloque
    $rp = $txt.IndexOf('<ReliabilityPage', $start)
    if ($rp -lt 0) {
        throw "No encontré el ReliabilityPage dentro de confiabilidad."
    }

    $ui = @'
          {/* V18.32 FILTRO IMPULSION CONFIABILIDAD */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-slate-500">Filtro de bombas:</span>

            <button
              type="button"
              onClick={() => setConfiabilidadFiltroBombas("impulsion")}
              className={
                "rounded-full border px-3 py-1.5 text-sm font-medium transition " +
                (confiabilidadFiltroBombas === "impulsion"
                  ? "border-blue-600 bg-blue-600 text-white shadow-sm"
                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50")
              }
            >
              Impulsión
            </button>

            <button
              type="button"
              onClick={() => setConfiabilidadFiltroBombas("todas")}
              className={
                "rounded-full border px-3 py-1.5 text-sm font-medium transition " +
                (confiabilidadFiltroBombas === "todas"
                  ? "border-slate-900 bg-slate-900 text-white shadow-sm"
                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50")
              }
            >
              Todas
            </button>

            <span className="text-xs text-slate-400">
              La tabla y el gráfico se filtran con esta selección.
            </span>
          </div>

'@

    $txt = $txt.Insert($rp, $ui)
}

Set-Content $path $txt -Encoding UTF8

Write-Host ""
Write-Host "V18.32 aplicado correctamente." -ForegroundColor Green
Write-Host ""
Write-Host "Ahora Operación y confiabilidad tiene filtro:" -ForegroundColor Cyan
Write-Host "- Impulsión (usa principalPumpIds / rol_red = impulsion_principal)"
Write-Host "- Todas"
Write-Host ""
Write-Host "El filtro impacta en ReliabilityPage completa (tabla + gráfico)." -ForegroundColor Green
Write-Host ""
Write-Host "Probá:" -ForegroundColor Yellow
Write-Host "cd FrontEnd\App_1"
Write-Host "npm run dev"
