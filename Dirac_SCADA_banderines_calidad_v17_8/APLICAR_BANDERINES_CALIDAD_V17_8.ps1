$ErrorActionPreference = "Stop"

$repo = Get-Location
$tank = Join-Path $repo "FrontEnd\App_2\src\features\infra-diagram\components\nodes\TankNodeView.tsx"

if (!(Test-Path $tank)) {
    throw "No encuentro TankNodeView.tsx. Ejecutá desde la raíz de DiracInstrumentacion."
}

$txt = Get-Content $tank -Raw

Write-Host "Aplicando V17.8 - banderines separados de calidad..." -ForegroundColor Cyan

# ============================================================
# Reemplazar el bloque actual del tanque por dos etiquetas separadas
# ============================================================
$tankPattern = '(?s)<g\s+data-role="tank-quality".*?</g>'

$tankReplacement = @'
<g data-role="tank-quality" style={{ pointerEvents: "none" }}>
        {/* Banderín Cloro */}
        <g transform={`translate(${W - 126}, 42)`}>
          <rect
            x={0}
            y={0}
            width={112}
            height={28}
            rx={9}
            fill="#ffffff"
            fillOpacity={0.98}
            stroke="#94a3b8"
            strokeWidth={1.2}
          />
          <path
            d="M 18 28 L 28 28 L 23 36 Z"
            fill="#ffffff"
            stroke="#94a3b8"
            strokeWidth={1.2}
          />
          <text
            x={12}
            y={12}
            fill="#64748b"
            style={{ fontSize: 8.5, fontWeight: 900, letterSpacing: 0.4 }}
          >
            CLORO
          </text>
          <text
            x={12}
            y={23}
            fill="#0f172a"
            style={{ fontSize: 10.5, fontWeight: 950 }}
          >
            {chlorineText}
          </text>
        </g>

        {/* Banderín pH */}
        <g transform={`translate(${W - 112}, 76)`}>
          <rect
            x={0}
            y={0}
            width={98}
            height={28}
            rx={9}
            fill="#ffffff"
            fillOpacity={0.98}
            stroke="#94a3b8"
            strokeWidth={1.2}
          />
          <path
            d="M 16 28 L 26 28 L 21 36 Z"
            fill="#ffffff"
            stroke="#94a3b8"
            strokeWidth={1.2}
          />
          <text
            x={12}
            y={12}
            fill="#64748b"
            style={{ fontSize: 8.5, fontWeight: 900, letterSpacing: 0.4 }}
          >
            pH
          </text>
          <text
            x={12}
            y={23}
            fill="#0f172a"
            style={{ fontSize: 12.5, fontWeight: 950 }}
          >
            {phText}
          </text>
        </g>
      </g>
'@

$new = [regex]::Replace($txt, $tankPattern, $tankReplacement, 1)
if ($new -eq $txt) {
    throw "No encontré el bloque data-role='tank-quality'."
}
$txt = $new

# ============================================================
# Reemplazar el bloque actual del pozo por dos etiquetas separadas
# ============================================================
$wellPattern = '(?s)<g\s+data-role="well-quality".*?</g>'

$wellReplacement = @'
<g data-role="well-quality" style={{ pointerEvents: "none" }}>
          {/* Banderín Cloro */}
          <g transform={`translate(${W - 130}, 52)`}>
            <rect
              x={0}
              y={0}
              width={114}
              height={30}
              rx={9}
              fill="#ffffff"
              fillOpacity={0.98}
              stroke="#94a3b8"
              strokeWidth={1.2}
            />
            <path
              d="M 18 30 L 28 30 L 23 38 Z"
              fill="#ffffff"
              stroke="#94a3b8"
              strokeWidth={1.2}
            />
            <text
              x={12}
              y={13}
              fill="#64748b"
              style={{ fontSize: 8.5, fontWeight: 900, letterSpacing: 0.4 }}
            >
              CLORO
            </text>
            <text
              x={12}
              y={25}
              fill="#0f172a"
              style={{ fontSize: 11, fontWeight: 950 }}
            >
              {chlorineText}
            </text>
          </g>

          {/* Banderín pH */}
          <g transform={`translate(${W - 114}, 88)`}>
            <rect
              x={0}
              y={0}
              width={98}
              height={30}
              rx={9}
              fill="#ffffff"
              fillOpacity={0.98}
              stroke="#94a3b8"
              strokeWidth={1.2}
            />
            <path
              d="M 16 30 L 26 30 L 21 38 Z"
              fill="#ffffff"
              stroke="#94a3b8"
              strokeWidth={1.2}
            />
            <text
              x={12}
              y={13}
              fill="#64748b"
              style={{ fontSize: 8.5, fontWeight: 900, letterSpacing: 0.4 }}
            >
              pH
            </text>
            <text
              x={12}
              y={25}
              fill="#0f172a"
              style={{ fontSize: 13, fontWeight: 950 }}
            >
              {phText}
            </text>
          </g>
        </g>
'@

$new = [regex]::Replace($txt, $wellPattern, $wellReplacement, 1)
if ($new -eq $txt) {
    Write-Host "Aviso: no encontré well-quality; sigo solo con tank-quality." -ForegroundColor Yellow
} else {
    $txt = $new
}

Set-Content $tank $txt -Encoding UTF8

Write-Host ""
Write-Host "V17.8 aplicado correctamente." -ForegroundColor Green
Write-Host "Se eliminó el bloque del medio y quedaron dos banderines separados." -ForegroundColor Green
