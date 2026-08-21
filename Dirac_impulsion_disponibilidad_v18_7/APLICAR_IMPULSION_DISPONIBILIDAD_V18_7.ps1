$ErrorActionPreference = "Stop"

$root = Get-Location

$backendSrc = ".\Dirac_impulsion_disponibilidad_v18_7\reemplazos\Backend\app\routes\infraestructura\pump_availability.py"
$backendDst = ".\Backend\app\routes\infraestructura\pump_availability.py"

$serviceSrc = ".\Dirac_impulsion_disponibilidad_v18_7\reemplazos\FrontEnd\App_2\src\features\infra-diagram\services\pumpAvailability.ts"
$serviceDst = ".\FrontEnd\App_2\src\features\infra-diagram\services\pumpAvailability.ts"

$initPath = ".\Backend\app\routes\infraestructura\__init__.py"
$infraPath = ".\FrontEnd\App_2\src\features\infra-diagram\InfraDiagram.tsx"

foreach ($f in @($backendSrc, $serviceSrc, $initPath, $infraPath)) {
    if (!(Test-Path $f)) {
        throw "No encuentro $f. Ejecutá desde la raíz de DiracInstrumentacion."
    }
}

Write-Host "Aplicando disponibilidad de bombas de impulsión V18.7..." -ForegroundColor Cyan

# ============================================================
# 1) Copiar archivos nuevos
# ============================================================
Copy-Item $backendSrc $backendDst -Force
Copy-Item $serviceSrc $serviceDst -Force

# ============================================================
# 2) Registrar router backend
# ============================================================
$init = Get-Content $initPath -Raw

$importLine = "from .pump_availability import router as pump_availability_router"
$includeLine = "router.include_router(pump_availability_router)"

if (!$init.Contains($importLine)) {
    $anchor = "from .node_servicio import router as node_servicio_router"
    if (!$init.Contains($anchor)) {
        throw "No encontré el import node_servicio_router en __init__.py."
    }
    $init = $init.Replace($anchor, $anchor + [Environment]::NewLine + $importLine)
}

if (!$init.Contains($includeLine)) {
    $anchor = "router.include_router(node_servicio_router)"
    if (!$init.Contains($anchor)) {
        throw "No encontré include_router(node_servicio_router)."
    }
    $init = $init.Replace($anchor, $anchor + [Environment]::NewLine + $includeLine)
}

Set-Content $initPath $init -Encoding UTF8

# ============================================================
# 3) Import frontend
# ============================================================
$txt = Get-Content $infraPath -Raw

$availabilityImport = 'import { getPumpAvailability, savePumpAvailability, type PumpAvailability } from "./services/pumpAvailability";'

if (!$txt.Contains($availabilityImport)) {
    $anchor = 'import { saveNodeServicio, type ServicioSCADA } from "./services/nodeServicio";'
    if (!$txt.Contains($anchor)) {
        throw "No encontré import nodeServicio en InfraDiagram.tsx."
    }
    $txt = $txt.Replace(
        $anchor,
        $anchor + [Environment]::NewLine + $availabilityImport
    )
}

# ============================================================
# 4) State frontend
# ============================================================
$stateLine = '  const [selectedPumpAvailability, setSelectedPumpAvailability] = useState<PumpAvailability | null>(null);'
$loadingLine = '  const [savingPumpAvailability, setSavingPumpAvailability] = useState(false);'

if (!$txt.Contains($stateLine)) {
    $anchor = '  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);'
    if (!$txt.Contains($anchor)) {
        throw "No encontré selectedNodeId state."
    }
    $txt = $txt.Replace(
        $anchor,
        $anchor + [Environment]::NewLine + $stateLine + [Environment]::NewLine + $loadingLine
    )
}

# ============================================================
# 5) Efecto: al seleccionar bomba, leer disponibilidad de DB
# ============================================================
$effectMarker = '  // V18.7 PUMP AVAILABILITY'
if (!$txt.Contains($effectMarker)) {
    $anchor = '  const selectedNode = selectedNodeId ? nodesById[selectedNodeId] : null;'
    if (!$txt.Contains($anchor)) {
        throw "No encontré const selectedNode."
    }

    $effect = @'

  // V18.7 PUMP AVAILABILITY
  useEffect(() => {
    let cancelled = false;

    if (!selectedNode || selectedNode.type !== "pump") {
      setSelectedPumpAvailability(null);
      return;
    }

    const pumpId = Number(String(selectedNode.id).split(":").pop());
    if (!Number.isFinite(pumpId)) {
      setSelectedPumpAvailability(null);
      return;
    }

    getPumpAvailability(pumpId)
      .then((row) => {
        if (!cancelled) setSelectedPumpAvailability(row);
      })
      .catch((err) => {
        if (!cancelled) {
          setSelectedPumpAvailability(null);
          // 404 = bomba secundaria/no principal. No mostramos botón.
          if (!String(err?.message || "").includes("404")) {
            console.error("No se pudo leer disponibilidad de bomba:", err);
          }
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedNodeId, selectedNode?.id, selectedNode?.type]);

  const toggleSelectedPumpAvailability = useCallback(async () => {
    if (!selectedPumpAvailability || savingPumpAvailability) return;

    try {
      setSavingPumpAvailability(true);
      const saved = await savePumpAvailability(
        selectedPumpAvailability.id,
        !selectedPumpAvailability.disponible
      );
      setSelectedPumpAvailability(saved);
    } catch (err: any) {
      console.error(err);
      alert(err?.message || "No se pudo actualizar disponibilidad");
    } finally {
      setSavingPumpAvailability(false);
    }
  }, [selectedPumpAvailability, savingPumpAvailability]);

'@

    $txt = $txt.Replace(
        $anchor,
        $anchor + $effect
    )
}

# ============================================================
# 6) Botón en barra superior
#    Aparece solo al seleccionar una de las 12 bombas principales
#    en modo Edición.
# ============================================================
$buttonMarker = '{/* V18.7 DISPONIBILIDAD IMPULSION */}'
if (!$txt.Contains($buttonMarker)) {
    $anchor = '        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>'

    if (!$txt.Contains($anchor)) {
        throw "No encontré la zona de botones de la barra superior."
    }

    $button = @'
        {/* V18.7 DISPONIBILIDAD IMPULSION */}
        {editMode &&
          selectedNode?.type === "pump" &&
          selectedPumpAvailability?.rol_red === "impulsion_principal" && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 7,
                marginLeft: 8,
                padding: "3px 7px",
                borderRadius: 9,
                border: "1px solid #cbd5e1",
                background: "#ffffff",
              }}
            >
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 900,
                  color: "#64748b",
                  textTransform: "uppercase",
                  letterSpacing: 0.4,
                }}
              >
                Impulsión
              </span>

              <button
                type="button"
                disabled={savingPumpAvailability}
                onClick={toggleSelectedPumpAvailability}
                title="Cambiar disponibilidad operativa de esta bomba"
                style={{
                  height: 26,
                  padding: "0 10px",
                  borderRadius: 999,
                  border: selectedPumpAvailability.disponible
                    ? "1px solid #86efac"
                    : "1px solid #fecaca",
                  background: selectedPumpAvailability.disponible
                    ? "#dcfce7"
                    : "#fee2e2",
                  color: selectedPumpAvailability.disponible
                    ? "#166534"
                    : "#b91c1c",
                  fontSize: 10,
                  fontWeight: 900,
                  cursor: savingPumpAvailability ? "wait" : "pointer",
                  opacity: savingPumpAvailability ? 0.65 : 1,
                }}
              >
                {savingPumpAvailability
                  ? "Guardando..."
                  : selectedPumpAvailability.disponible
                  ? "Disponible"
                  : "No disponible"}
              </button>
            </div>
          )}

'@

    $txt = $txt.Replace(
        $anchor,
        $button + $anchor
    )
}

Set-Content $infraPath $txt -Encoding UTF8

Write-Host ""
Write-Host "V18.7 aplicado correctamente." -ForegroundColor Green
Write-Host ""
Write-Host "Cómo usar:" -ForegroundColor Yellow
Write-Host "1. Abrí App_2"
Write-Host "2. Tocá Editar"
Write-Host "3. Seleccioná una de las 12 bombas de impulsión"
Write-Host "4. Arriba aparece el botón Disponible / No disponible"
Write-Host "5. El cambio se guarda directamente en Supabase"
Write-Host ""
Write-Host "IMPORTANTE: este paquete agrega endpoint backend; hacé commit/push para redeploy de Render." -ForegroundColor Cyan
