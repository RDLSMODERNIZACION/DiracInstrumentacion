$ErrorActionPreference = "Stop"

$repo = Get-Location
$infra = Join-Path $repo "FrontEnd\App_2\src\features\infra-diagram\InfraDiagram.tsx"
$pump  = Join-Path $repo "FrontEnd\App_2\src\features\infra-diagram\components\nodes\PumpNodeView.tsx"

foreach ($f in @($infra,$pump)) {
    if (!(Test-Path $f)) {
        throw "No encuentro $f. Ejecutá desde la raíz de DiracInstrumentacion."
    }
}

Write-Host "Aplicando selección de bomba por evento directo..." -ForegroundColor Cyan

# =========================================================
# 1) PumpNodeView: emitir CustomEvent en PointerDown
# =========================================================
$p = Get-Content $pump -Raw

# Reemplazar el log existente por log + evento.
$p = $p.Replace(
'console.log("[PUMP-TAP][PUMP_POINTER_SELECT]", { id: n.id });',
'console.log("[PUMP-TAP][PUMP_POINTER_SELECT]", { id: n.id });
            window.dispatchEvent(new CustomEvent("dirac:pump-tap-select", { detail: { nodeId: n.id } }));'
)

Set-Content $pump $p -Encoding UTF8

# =========================================================
# 2) InfraDiagram: escuchar el evento y setear pumpTapFrom
# =========================================================
$i = Get-Content $infra -Raw

if ($i -notmatch 'dirac:pump-tap-select') {
    $anchor = '  useEffect(() => {' + "`r`n" + '    console.log("[PUMP-TAP][STATE]"'

    $idx = $i.IndexOf($anchor)

    if ($idx -lt 0) {
        # fallback: insertar antes de pumpTapByEdge
        $anchor2 = '  const pumpTapByEdge = useMemo(() => {'
        $idx = $i.IndexOf($anchor2)
    }

    if ($idx -lt 0) {
        throw "No pude encontrar dónde insertar el listener en InfraDiagram.tsx"
    }

    $listener = @'
  useEffect(() => {
    const onPumpTapSelect = (ev: Event) => {
      const custom = ev as CustomEvent<{ nodeId?: string }>;
      const nodeId = custom.detail?.nodeId;

      console.log("[PUMP-TAP][PUMP_SELECT_EVENT]", {
        nodeId,
        editMode,
        connectMode,
      });

      if (!nodeId || !editMode || !connectMode) return;

      setPumpTapFrom((prev) => (prev === nodeId ? null : nodeId));
      setConnectFrom(null);
    };

    window.addEventListener("dirac:pump-tap-select", onPumpTapSelect as EventListener);

    return () => {
      window.removeEventListener("dirac:pump-tap-select", onPumpTapSelect as EventListener);
    };
  }, [editMode, connectMode]);

'@

    $i = $i.Insert($idx, $listener)
}

Set-Content $infra $i -Encoding UTF8

Write-Host ""
Write-Host "LISTO." -ForegroundColor Green
Write-Host "Ahora PumpNodeView emite un evento global y InfraDiagram lo escucha directamente." -ForegroundColor Green
Write-Host ""
Write-Host "Esperado en consola:" -ForegroundColor Yellow
Write-Host "  [PUMP-TAP][PUMP_POINTER_SELECT]"
Write-Host "  [PUMP-TAP][PUMP_SELECT_EVENT]"
Write-Host "  [PUMP-TAP][STATE] pumpTapFrom = pump:XX"
