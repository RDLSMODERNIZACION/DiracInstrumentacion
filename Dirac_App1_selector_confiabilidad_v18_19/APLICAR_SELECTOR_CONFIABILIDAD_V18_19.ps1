$ErrorActionPreference = "Stop"

$path = ".\FrontEnd\App_1\src\widget\index.tsx"

if (!(Test-Path $path)) {
    throw "No encuentro $path. Ejecutá desde la raíz de DiracInstrumentacion."
}

$txt = Get-Content $path -Raw

Write-Host "Aplicando V18.19 - selector propio de Confiabilidad..." -ForegroundColor Cyan

$marker = '{/* V18.19 SELECTOR CONFIABILIDAD */}'

if ($txt.Contains($marker)) {
    Write-Host "El selector V18.19 ya está insertado." -ForegroundColor Yellow
    exit 0
}

# Buscar el inicio real de la pestaña confiabilidad sin depender del contenido interno.
$pattern = '\{tab\s*===\s*"confiabilidad"\s*&&\s*\('
$m = [regex]::Match($txt, $pattern)

if (!$m.Success) {
    throw "No encontré el inicio de la pestaña confiabilidad."
}

$selector = @'
      {/* V18.19 SELECTOR CONFIABILIDAD */}
      {tab === "confiabilidad" && (
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <div className="w-full max-w-sm">
            <LocationSelect
              label="Ubicación"
              value={loc}
              onChange={(v) => setLoc(v as number | "all")}
              options={locOptionsAll}
              allowAll
            />
          </div>

          <div className="text-xs text-slate-400">
            Filtro exclusivo de Operación y confiabilidad
          </div>
        </div>
      )}

'@

$txt = $txt.Insert($m.Index, $selector)

Set-Content $path $txt -Encoding UTF8

Write-Host ""
Write-Host "V18.19 aplicado correctamente." -ForegroundColor Green
Write-Host "Se agregó un único selector de Ubicación justo antes de Confiabilidad." -ForegroundColor Green
Write-Host "No se modificó ReliabilityPage ni el resto de las pestañas." -ForegroundColor Cyan
