$ErrorActionPreference = "Stop"

$path = ".\FrontEnd\App_1\src\components\ReliabilityPage.tsx"

if (!(Test-Path $path)) {
    throw "No encuentro $path. Ejecutá desde la raíz de DiracInstrumentacion."
}

$txt = Get-Content $path -Raw
Write-Host "Aplicando V18.35 - filtro Impulsión definitivo..." -ForegroundColor Cyan

# ============================================================
# 1) States
# ============================================================
if ($txt -notmatch 'reliabilityPumpFilter') {
    $anchor = '  const [view, setView] = useState<ViewMode>("pumps");'
    if (!$txt.Contains($anchor)) {
        throw "No encontré el state view."
    }

    $states = @'
  const [reliabilityPumpFilter, setReliabilityPumpFilter] =
    useState<"impulsion" | "todas">("impulsion");
  const [impulsionPumpIds, setImpulsionPumpIds] =
    useState<Set<number>>(new Set());

'@
    $txt = $txt.Replace($anchor, $anchor + [Environment]::NewLine + $states)
}

# ============================================================
# 2) Cargar IDs reales desde la base
# ============================================================
if ($txt -notmatch 'V18\.35 IMPULSION IDS') {
    $anchor = '  const locParam = safeLocationId(locationId);'
    if (!$txt.Contains($anchor)) {
        throw "No encontré locParam."
    }

    $effect = @'

  // V18.35 IMPULSION IDS
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

    $txt = $txt.Replace($anchor, $anchor + $effect)
}

# ============================================================
# 3) Filtrar datos diarios
# ============================================================
$dailyPattern = '(?s)  const filteredPumpDaily = useMemo\(\(\) => \{.*?\n  \}, \[pumpDaily, selectedPumpSet\]\);'
$dailyReplacement = @'
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
  }, [pumpDaily, selectedPumpSet, reliabilityPumpFilter, impulsionPumpIds]);
'@

$newTxt = [regex]::Replace($txt, $dailyPattern, $dailyReplacement, 1)
if ($newTxt -eq $txt -and $txt -notmatch 'reliabilityPumpFilter === "impulsion"') {
    throw "No pude modificar filteredPumpDaily."
}
$txt = $newTxt

# ============================================================
# 4) Filtrar tabla mensual
# ============================================================
$tablePattern = '(?s)  const filteredPumpTable = useMemo\(\(\) => \{.*?\n  \}, \[pumpTable, selectedPumpSet\]\);'
$tableReplacement = @'
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
  }, [pumpTable, selectedPumpSet, reliabilityPumpFilter, impulsionPumpIds]);
'@

$newTxt = [regex]::Replace($txt, $tablePattern, $tableReplacement, 1)
if ($newTxt -eq $txt -and $txt -notmatch 'filteredPumpTable.*reliabilityPumpFilter') {
    throw "No pude modificar filteredPumpTable."
}
$txt = $newTxt

# ============================================================
# 5) Insertar UI en lugar estable:
#    después del encabezado principal y antes de error/KPIs
# ============================================================
$marker = '{/* V18.35 FILTRO IMPULSION */}'
if (!$txt.Contains($marker)) {
    $needle = '            Selectores superiores aplicados'
    $needlePos = $txt.IndexOf($needle)

    if ($needlePos -lt 0) {
        throw "No encontré el texto 'Selectores superiores aplicados'."
    }

    $sectionEnd = $txt.IndexOf('</section>', $needlePos)
    if ($sectionEnd -lt 0) {
        throw "No encontré el cierre del encabezado principal."
    }
    $sectionEnd += '</section>'.Length

    $ui = @'


      {/* V18.35 FILTRO IMPULSION */}
      {view === "pumps" && (
        <section className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Filtro de bombas
            </span>

            <button
              type="button"
              onClick={() => setReliabilityPumpFilter("impulsion")}
              className={
                "rounded-full border px-4 py-2 text-sm font-semibold transition " +
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
                "rounded-full border px-4 py-2 text-sm font-semibold transition " +
                (reliabilityPumpFilter === "todas"
                  ? "border-slate-900 bg-slate-900 text-white shadow-sm"
                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50")
              }
            >
              Todas
            </button>

            <span className="ml-1 text-xs text-slate-400">
              {reliabilityPumpFilter === "impulsion"
                ? `${impulsionPumpIds.size} bombas de impulsión`
                : "Todas las bombas"}
            </span>
          </div>
        </section>
      )}
'@

    $txt = $txt.Insert($sectionEnd, $ui)
}

Set-Content $path $txt -Encoding UTF8

Write-Host ""
Write-Host "V18.35 aplicado correctamente." -ForegroundColor Green
Write-Host "Filtro: Impulsión / Todas." -ForegroundColor Green
Write-Host "Por defecto queda Impulsión." -ForegroundColor Cyan
Write-Host "Filtra KPIs, gráfico y tabla mensual." -ForegroundColor Cyan
Write-Host ""
Write-Host "Probá:" -ForegroundColor Yellow
Write-Host "cd FrontEnd\App_1"
Write-Host "npm run dev"
