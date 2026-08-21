$ErrorActionPreference = "Stop"

$path = ".\FrontEnd\App_1\src\widget\index.tsx"

if (!(Test-Path $path)) {
    throw "No encuentro $path. Ejecutá desde la raíz de DiracInstrumentacion."
}

$txt = Get-Content $path -Raw

Write-Host "Aplicando V18.18 - selector único en Operación y confiabilidad..." -ForegroundColor Cyan

$old = @'
      {tab === "confiabilidad" && (
        <ReliabilityPage
          locationId={loc === "all" ? "all" : locId ?? "all"}
          selectedPumpIds={selectedPumpIds}
          selectedTankIds={selectedTankIds}
          thresholdLow={90}
        />
      )}
'@

$new = @'
      {tab === "confiabilidad" && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
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

          <ReliabilityPage
            locationId={loc === "all" ? "all" : locId ?? "all"}
            selectedPumpIds={selectedPumpIds}
            selectedTankIds={selectedTankIds}
            thresholdLow={90}
          />
        </section>
      )}
'@

if (!$txt.Contains($old)) {
    throw "No encontré el bloque actual de Operación y confiabilidad."
}

$txt = $txt.Replace($old, $new)

Set-Content $path $txt -Encoding UTF8

Write-Host ""
Write-Host "V18.18 aplicado correctamente." -ForegroundColor Green
Write-Host "Ahora Operación y confiabilidad tiene un único selector de Ubicación." -ForegroundColor Green
Write-Host "Las demás pestañas quedan sin ese selector." -ForegroundColor Cyan
