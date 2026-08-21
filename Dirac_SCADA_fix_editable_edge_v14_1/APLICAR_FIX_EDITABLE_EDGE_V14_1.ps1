$ErrorActionPreference = "Stop"

$repo = Get-Location
$edge = Join-Path $repo "FrontEnd\App_2\src\features\infra-diagram\components\edges\EditableEdge.tsx"

if (!(Test-Path $edge)) {
    throw "No encuentro EditableEdge.tsx. Ejecutá esto desde la raíz de DiracInstrumentacion."
}

$txt = Get-Content $edge -Raw

Write-Host "Corrigiendo bloque Pump Pipe Tap en EditableEdge.tsx..." -ForegroundColor Cyan

$startToken = '{tapConnectMode && onTapPipeClick && ('
$hitToken   = '      {/* hit test */}'

$start = $txt.IndexOf($startToken)
$hit   = $txt.IndexOf($hitToken)

if ($start -lt 0) {
    throw "No encontré el bloque tapConnectMode en EditableEdge.tsx"
}

if ($hit -lt 0 -or $hit -le $start) {
    throw "No encontré el bloque hit test después de tapConnectMode."
}

$cleanBlock = @'
{tapConnectMode && onTapPipeClick && (
        <path
          data-role="pump-tap-connect-highlight"
          d={geom.d}
          fill="none"
          stroke="#38bdf8"
          strokeWidth={18}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.32}
          style={{
            pointerEvents: "stroke",
            cursor: "crosshair",
          }}
          onPointerDown={(ev) => {
            const p = svgPointFromEvent(ev);
            if (!p) return;

            ev.preventDefault();
            ev.stopPropagation();

            onTapPipeClick(id, p.x, p.y);
          }}
        />
      )}


'@

$before = $txt.Substring(0, $start)
$after  = $txt.Substring($hit)

$txt = $before + $cleanBlock + $after

Set-Content $edge $txt -Encoding UTF8

Write-Host ""
Write-Host "EditableEdge.tsx corregido." -ForegroundColor Green
Write-Host "Ahora ejecutá:" -ForegroundColor Yellow
Write-Host "  cd FrontEnd\App_2"
Write-Host "  npm run dev"
