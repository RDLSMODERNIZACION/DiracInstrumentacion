$ErrorActionPreference = "Stop"

$path = ".\FrontEnd\App_1\src\components\ReliabilityPage.tsx"

if (!(Test-Path $path)) {
    throw "No encuentro $path. Ejecutá desde la raíz de DiracInstrumentacion."
}

$txt = Get-Content $path -Raw

Write-Host "Aplicando V18.33 - filtro Impulsión dentro de ReliabilityPage..." -ForegroundColor Cyan

# ============================================================
# 1) Agregar state propio, sin depender de index.tsx
# ============================================================
if ($txt -notmatch 'reliabilityPumpFilter') {
    $anchor = '  const [view, setView] = useState<ViewMode>("pumps");'
    if (!$txt.Contains($anchor)) {
        throw "No encontré el state 'view' en ReliabilityPage.tsx."
    }

    $states = @'
  const [reliabilityPumpFilter, setReliabilityPumpFilter] =
    useState<"impulsion" | "todas">("impulsion");
  const [impulsionPumpIds, setImpulsionPumpIds] = useState<Set<number>>(new Set());

'@

    $txt = $txt.Replace($anchor, $anchor + [Environment]::NewLine + $states)
}

# ============================================================
# 2) Cargar bombas de impulsión desde endpoint existente
#    /infraestructura/pump_availability
# ============================================================
$effectMarker = '// V18.33 IMPULSION FILTER'
if (!$txt.Contains($effectMarker)) {
    $anchor = '  const locParam = safeLocationId(locationId);'
    if (!$txt.Contains($anchor)) {
        throw "No encontré locParam."
    }

    $effect = @'

  // V18.33 IMPULSION FILTER
  useEffect(() => {
    let alive = true;

    fetchJson<any[]>("/infraestructura/pump_availability")
      .then((rows) => {
        if (!alive) return;

        const ids = new Set(
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
# 3) Modificar filtrados diarios y tabla
# ============================================================
$oldPumpDaily = @'
  const filteredPumpDaily = useMemo(() => {
    if (!selectedPumpSet) return pumpDaily;
    return pumpDaily.filter((r) => selectedPumpSet.has(Number(r.pump_id)));
  }, [pumpDaily, selectedPumpSet]);
'@

$newPumpDaily = @'
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

if ($txt.Contains($oldPumpDaily)) {
    $txt = $txt.Replace($oldPumpDaily, $newPumpDaily)
} elseif ($txt -notmatch 'reliabilityPumpFilter === "impulsion"') {
    throw "No encontré filteredPumpDaily para modificar."
}

$oldPumpTable = @'
  const filteredPumpTable = useMemo(() => {
    if (!selectedPumpSet) return pumpTable;
    return pumpTable.filter((r) => selectedPumpSet.has(Number(r.pump_id)));
  }, [pumpTable, selectedPumpSet]);
'@

$newPumpTable = @'
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

if ($txt.Contains($oldPumpTable)) {
    $txt = $txt.Replace($oldPumpTable, $newPumpTable)
}

# ============================================================
# 4) Insertar botones cerca del encabezado de la vista Bombas
# ============================================================
$uiMarker = '{/* V18.33 FILTRO IMPULSION */}'
if (!$txt.Contains($uiMarker)) {
    # Buscar un sitio estable: justo antes del primer bloque KPI.
    $anchor = '      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">'
    $pos = $txt.IndexOf($anchor)

    if ($pos -lt 0) {
        # fallback antes de gráfico principal
        $anchor = '      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">'
        $pos = $txt.IndexOf($anchor)
    }

    if ($pos -lt 0) {
        throw "No encontré un lugar seguro para insertar el filtro."
    }

    $ui = @'
      {/* V18.33 FILTRO IMPULSION */}
      {view === "pumps" && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
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

    $txt = $txt.Insert($pos, $ui)
}

Set-Content $path $txt -Encoding UTF8

Write-Host ""
Write-Host "V18.33 aplicado correctamente." -ForegroundColor Green
Write-Host ""
Write-Host "Ahora el filtro vive dentro de ReliabilityPage y NO depende de principalPumpIds." -ForegroundColor Cyan
Write-Host "Por defecto: Impulsión." -ForegroundColor Green
Write-Host "Usa /infraestructura/pump_availability para saber cuáles son de impulsión." -ForegroundColor Green
Write-Host ""
Write-Host "Probá:" -ForegroundColor Yellow
Write-Host "cd FrontEnd\App_1"
Write-Host "npm run dev"
