$ErrorActionPreference = "Stop"

$repo = Get-Location
$tank = Join-Path $repo "FrontEnd\App_2\src\features\infra-diagram\components\nodes\TankNodeView.tsx"

if (!(Test-Path $tank)) {
    throw "No encuentro TankNodeView.tsx. Ejecutá desde la raíz de DiracInstrumentacion."
}

$txt = Get-Content $tank -Raw

Write-Host "Aplicando V17.7 - mover Cloro/pH arriba a la derecha..." -ForegroundColor Cyan

# TANQUE NORMAL
$tankPattern = '(?s)<g\s+data-role="tank-quality".*?</g>'

$tankReplacement = @'
<g data-role="tank-quality" style={{ pointerEvents: "none" }}>
        <rect
          x={W - 126}
          y={52}
          width={112}
          height={50}
          rx={10}
          fill="#ffffff"
          fillOpacity={0.97}
          stroke="#94a3b8"
          strokeWidth={1.2}
        />

        <text
          x={W - 114}
          y={67}
          fill="#64748b"
          style={{ fontSize: 9, fontWeight: 900, letterSpacing: 0.4 }}
        >
          CLORO
        </text>

        <text
          x={W - 114}
          y={87}
          fill="#0f172a"
          style={{ fontSize: 14, fontWeight: 950 }}
        >
          {chlorineText}
        </text>

        <text
          x={W - 44}
          y={67}
          fill="#64748b"
          style={{ fontSize: 9, fontWeight: 900, letterSpacing: 0.4 }}
        >
          pH
        </text>

        <text
          x={W - 44}
          y={87}
          fill="#0f172a"
          style={{ fontSize: 16, fontWeight: 950 }}
        >
          {phText}
        </text>
      </g>
'@

$new = [regex]::Replace($txt, $tankPattern, $tankReplacement, 1)
if ($new -eq $txt) {
    throw "No encontré el bloque data-role='tank-quality'."
}
$txt = $new

# POZO
$wellPattern = '(?s)<g\s+data-role="well-quality".*?</g>'

$wellReplacement = @'
<g data-role="well-quality" style={{ pointerEvents: "none" }}>
          <rect
            x={W - 130}
            y={62}
            width={116}
            height={52}
            rx={10}
            fill="#ffffff"
            fillOpacity={0.97}
            stroke="#94a3b8"
            strokeWidth={1.2}
          />

          <text
            x={W - 118}
            y={78}
            fill="#64748b"
            style={{ fontSize: 9, fontWeight: 900, letterSpacing: 0.4 }}
          >
            CLORO
          </text>

          <text
            x={W - 118}
            y={99}
            fill="#0f172a"
            style={{ fontSize: 14, fontWeight: 950 }}
          >
            {chlorineText}
          </text>

          <text
            x={W - 46}
            y={78}
            fill="#64748b"
            style={{ fontSize: 9, fontWeight: 900, letterSpacing: 0.4 }}
          >
            pH
          </text>

          <text
            x={W - 46}
            y={99}
            fill="#0f172a"
            style={{ fontSize: 16, fontWeight: 950 }}
          >
            {phText}
          </text>
        </g>
'@

$new = [regex]::Replace($txt, $wellPattern, $wellReplacement, 1)
if ($new -ne $txt) {
    $txt = $new
} else {
    Write-Host "Aviso: no encontré well-quality; sigo solo con tank-quality." -ForegroundColor Yellow
}

Set-Content $tank $txt -Encoding UTF8

Write-Host ""
Write-Host "V17.7 aplicado correctamente." -ForegroundColor Green
Write-Host "Cloro/pH ahora quedan arriba a la derecha con números más grandes." -ForegroundColor Green
