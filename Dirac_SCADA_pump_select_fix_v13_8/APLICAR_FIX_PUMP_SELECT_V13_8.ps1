$ErrorActionPreference = "Stop"

$repo = Get-Location
$infra = Join-Path $repo "FrontEnd\App_2\src\features\infra-diagram\InfraDiagram.tsx"
$pump = Join-Path $repo "FrontEnd\App_2\src\features\infra-diagram\components\nodes\PumpNodeView.tsx"

foreach ($f in @($infra,$pump)) {
    if (!(Test-Path $f)) {
        throw "No encuentro $f. Ejecutá desde la raíz de DiracInstrumentacion."
    }
}

Write-Host "Aplicando selección directa bomba -> InfraDiagram..." -ForegroundColor Cyan

# =========================================================
# 1) PumpNodeView: agregar callback específico onTapSelect
# =========================================================
$p = Get-Content $pump -Raw

if ($p -notmatch 'onTapSelect\?:') {
    $p = $p.Replace(
'onClick,
  tapSelected = false,',
'onClick,
  onTapSelect,
  tapSelected = false,'
    )

    $p = $p.Replace(
'onClick?: () => void;
  tapSelected?: boolean;',
'onClick?: () => void;
  onTapSelect?: (nodeId: string) => void;
  tapSelected?: boolean;'
    )
}

# Reemplazar selección por pointerdown para llamar DIRECTO a onTapSelect
$p = $p.Replace(
'console.log("[PUMP-TAP][PUMP_POINTER_SELECT]", { id: n.id });
            onClick();',
'console.log("[PUMP-TAP][PUMP_POINTER_SELECT]", { id: n.id });
            if (onTapSelect) {
              onTapSelect(n.id);
            } else {
              onClick();
            }'
)

# Por si hay variante con optional chaining
$p = $p.Replace(
'console.log("[PUMP-TAP][PUMP_POINTER_SELECT]", { id: n.id });
            onClick?.();',
'console.log("[PUMP-TAP][PUMP_POINTER_SELECT]", { id: n.id });
            if (onTapSelect) {
              onTapSelect(n.id);
            } else {
              onClick?.();
            }'
)

Set-Content $pump $p -Encoding UTF8

# =========================================================
# 2) InfraDiagram: callback dedicado que cambia pumpTapFrom
# =========================================================
$i = Get-Content $infra -Raw

if ($i -notmatch 'handlePumpTapSelect') {
    $anchor = '  const handlePumpTapPipeClick = useCallback'

    $idx = $i.IndexOf($anchor)

    if ($idx -lt 0) {
        throw "No encuentro handlePumpTapPipeClick en InfraDiagram.tsx"
    }

    $block = @'
  const handlePumpTapSelect = useCallback((nodeId: string) => {
    console.log("[PUMP-TAP][PUMP_SELECT]", {
      nodeId,
      previous: pumpTapFrom,
      editMode,
      connectMode,
    });

    if (!editMode || !connectMode) return;

    setPumpTapFrom((prev) => (prev === nodeId ? null : nodeId));
    setConnectFrom(null);
  }, [editMode, connectMode, pumpTapFrom]);

'@

    $i = $i.Insert($idx, $block)
}

# Agregar onTapSelect a PumpNodeView
if ($i -notmatch 'onTapSelect=\{\(\) => handlePumpTapSelect\(n\.id\)\}') {
    $needle = 'tapSelected={pumpTapFrom === n.id}'

    if ($i.Contains($needle)) {
        $i = $i.Replace(
            $needle,
            $needle + "`r`n                      onTapSelect={() => handlePumpTapSelect(n.id)}"
        )
    } else {
        # fallback dentro del bloque PumpNodeView
        $start = $i.IndexOf('<PumpNodeView')
        if ($start -lt 0) {
            throw "No encuentro PumpNodeView en InfraDiagram.tsx"
        }

        $end = $i.IndexOf('/>', $start)

        if ($end -lt 0) {
            throw "No encuentro cierre de PumpNodeView"
        }

        $tag = $i.Substring($start, $end - $start)

        if ($tag -notmatch 'onTapSelect=') {
            $tag = $tag.Replace(
                'enabled={editMode && !connectMode}',
                'enabled={editMode && !connectMode}' + "`r`n                      onTapSelect={() => handlePumpTapSelect(n.id)}"
            )
        }

        $i = $i.Substring(0, $start) + $tag + $i.Substring($end)
    }
}

Set-Content $infra $i -Encoding UTF8

Write-Host ""
Write-Host "LISTO." -ForegroundColor Green
Write-Host "Ahora PumpNodeView llama directamente a handlePumpTapSelect de InfraDiagram." -ForegroundColor Green
Write-Host ""
Write-Host "Esperado al tocar una bomba:" -ForegroundColor Yellow
Write-Host "  [PUMP-TAP][PUMP_POINTER_SELECT]"
Write-Host "  [PUMP-TAP][PUMP_SELECT]"
Write-Host "  [PUMP-TAP][STATE] con pumpTapFrom = pump:XX"
