$ErrorActionPreference = "Stop"

$path = ".\FrontEnd\App_1\src\components\ReliabilityPage.tsx"

if (!(Test-Path $path)) {
    throw "No encuentro $path. Ejecutá desde la raíz de DiracInstrumentacion."
}

$txt = Get-Content $path -Raw

Write-Host "Aplicando V18.34 - filtro Impulsión robusto..." -ForegroundColor Cyan

# ============================================================
# 1) State propio de ReliabilityPage
# ============================================================
if ($txt -notmatch 'reliabilityPumpFilter') {
    $m = [regex]::Match(
        $txt,
        'const\s+\[view,\s*setView\]\s*=\s*useState<ViewMode>\("pumps"\);'
    )

    if (!$m.Success) {
        throw "No encontré el state view en ReliabilityPage.tsx."
    }

    $insert = @'

  const [reliabilityPumpFilter, setReliabilityPumpFilter] =
    useState<"impulsion" | "todas">("impulsion");
  const [impulsionPumpIds, setImpulsionPumpIds] =
    useState<Set<number>>(new Set());

'@

    $txt = $txt.Insert($m.Index + $m.Length, $insert)
}

# ============================================================
# 2) Cargar IDs de impulsión desde /pump_availability
# ============================================================
if ($txt -notmatch 'V18\.34 IMPULSION IDS') {
    $m = [regex]::Match(
        $txt,
        'const\s+locParam\s*=\s*safeLocationId\(locationId\);'
    )

    if (!$m.Success) {
        throw "No encontré locParam."
    }

    $effect = @'

  // V18.34 IMPULSION IDS
  useEffect(() => {
    let alive = true;

    fetchJson<any[]>("/infraestructura/pump_availability")
      .then((rows) => {
        if (!alive) return;

        const ids = new Set<number>(
          (Array.isArray(rows) ? rows : [])
            .map((r: any) => Number(r?.id ?? r?.pump_id))
            .filter((id: number) => Number.isFinite(id))
        );

        setImpulsionPumpIds(ids);
      })
      .catch((err) => {
        console.error("[ReliabilityPage] impulsion filter:", err);
        if (alive) setImpulsionPumpIds(new Set());
      });

    return () => {
      alive = false;
    };
  }, []);

'@

    $txt = $txt.Insert($m.Index + $m.Length, $effect)
}

# ============================================================
# 3) Reemplazar filteredPumpDaily de manera estructural
# ============================================================
$dailyPattern = '(?s)const\s+filteredPumpDaily\s*=\s*useMemo\(\(\)\s*=>\s*\{.*?\},\s*\[[^\]]*\]\s*\);'
$dailyMatch = [regex]::Match($txt, $dailyPattern)

if (!$dailyMatch.Success) {
    throw "No pude localizar estructuralmente filteredPumpDaily."
}

$newDaily = @'
const filteredPumpDaily = useMemo(() => {
    return pumpDaily.filter((r) => {
      const id = Number(r.pump_id);

      if (selectedPumpSet && !selectedPumpSet.has(id)) {
        return false;
      }

      if (
        reliabilityPumpFilter === "impulsion" &&
        impulsionPumpIds.size > 0 &&
        !impulsionPumpIds.has(id)
      ) {
        return false;
      }

      return true;
    });
  }, [
    pumpDaily,
    selectedPumpSet,
    reliabilityPumpFilter,
    impulsionPumpIds,
  ]);
'@

$txt = $txt.Substring(0, $dailyMatch.Index) + $newDaily + $txt.Substring($dailyMatch.Index + $dailyMatch.Length)

# ============================================================
# 4) Reemplazar filteredPumpTable de manera estructural
# ============================================================
$tablePattern = '(?s)const\s+filteredPumpTable\s*=\s*useMemo\(\(\)\s*=>\s*\{.*?\},\s*\[[^\]]*\]\s*\);'
$tableMatch = [regex]::Match($txt, $tablePattern)

if (!$tableMatch.Success) {
    throw "No pude localizar estructuralmente filteredPumpTable."
}

$newTable = @'
const filteredPumpTable = useMemo(() => {
    return pumpTable.filter((r) => {
      const id = Number(r.pump_id);

      if (selectedPumpSet && !selectedPumpSet.has(id)) {
        return false;
      }

      if (
        reliabilityPumpFilter === "impulsion" &&
        impulsionPumpIds.size > 0 &&
        !impulsionPumpIds.has(id)
      ) {
        return false;
      }

      return true;
    });
  }, [
    pumpTable,
    selectedPumpSet,
    reliabilityPumpFilter,
    impulsionPumpIds,
  ]);
'@

$txt = $txt.Substring(0, $tableMatch.Index) + $newTable + $txt.Substring($tableMatch.Index + $tableMatch.Length)

# ============================================================
# 5) Insertar botones de filtro
# ============================================================
$marker = '{/* V18.34 FILTRO IMPULSION */}'

if (!$txt.Contains($marker)) {
    # Insertar antes del primer grid de KPIs después del return
    $returnPos = $txt.IndexOf("  return (")
    if ($returnPos -lt 0) {
        throw "No encontré el return principal."
    }

    $gridMatch = [regex]::Match(
        $txt.Substring($returnPos),
        '<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">'
    )

    if (!$gridMatch.Success) {
        throw "No encontré el bloque KPI para insertar el filtro."
    }

    $insertPos = $returnPos + $gridMatch.Index

    $ui = @'
      {/* V18.34 FILTRO IMPULSION */}
      {view === "pumps" && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-slate-500">
            Mostrar:
          </span>

          <button
            type="button"
            onClick={() => setReliabilityPumpFilter("impulsion")}
            className={
              "rounded-full border px-3 py-1.5 text-sm font-semibold transition " +
              (reliabilityPumpFilter === "impulsion"
                ? "border-blue-600 bg-blue-600 text-white shadow-sm"
                : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50")
            }
          >
            Impulsión
          </button>

          <button
            type="button"
            onClick={() => setReliabilityPumpFilter("todas")}
            className={
              "rounded-full border px-3 py-1.5 text-sm font-semibold transition " +
              (reliabilityPumpFilter === "todas"
                ? "border-slate-900 bg-slate-900 text-white shadow-sm"
                : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50")
            }
          >
            Todas
          </button>
        </div>
      )}

'@

    $txt = $txt.Insert($insertPos, $ui)
}

Set-Content $path $txt -Encoding UTF8

Write-Host ""
Write-Host "V18.34 aplicado correctamente." -ForegroundColor Green
Write-Host "Filtro agregado dentro de ReliabilityPage." -ForegroundColor Green
Write-Host "Por defecto queda en Impulsión." -ForegroundColor Cyan
Write-Host "Filtra tabla y gráfico usando /infraestructura/pump_availability." -ForegroundColor Cyan
Write-Host ""
Write-Host "Probá:" -ForegroundColor Yellow
Write-Host "cd FrontEnd\App_1"
Write-Host "npm run dev"
