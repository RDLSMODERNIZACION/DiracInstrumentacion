$ErrorActionPreference = "Stop"

$repo = Get-Location
$tank = Join-Path $repo "FrontEnd\App_2\src\features\infra-diagram\components\nodes\TankNodeView.tsx"

if (!(Test-Path $tank)) {
    throw "No encuentro TankNodeView.tsx. Ejecutá desde la raíz de DiracInstrumentacion."
}

$txt = Get-Content $tank -Raw

Write-Host "Aplicando V17.4 - calidad visible dentro del tanque..." -ForegroundColor Cyan

# ============================================================
# 1) Asegurar variables de calidad
# ============================================================
if ($txt -notmatch 'const chlorineText =') {
    $anchor = '  const level = Math.max(0, Math.min(100, levelRaw ?? 0));'

    if (!$txt.Contains($anchor)) {
        throw "No encontré el cálculo de level."
    }

    $vars = @'

  const chlorineRaw = Number((n as any).chlorine_mg_l);
  const phRaw = Number((n as any).ph);

  const chlorineText =
    Number.isFinite(chlorineRaw) ? `${chlorineRaw.toFixed(2)} mg/L` : "-- mg/L";

  const phText =
    Number.isFinite(phRaw) ? phRaw.toFixed(2) : "--";
'@

    $txt = $txt.Replace($anchor, $anchor + $vars)
}

# ============================================================
# 2) TANQUE NORMAL
#    Insertar el bloque SIEMPRE después del texto de porcentaje.
#    Lo colocamos más arriba, separado del % y por encima del agua.
# ============================================================

if ($txt -notmatch 'data-role="tank-water-quality"') {

    $pattern = '(?s)(<text\s+x=\{W / 2\}\s+y=\{135\}.*?>\s*\{level\.toFixed\(0\)\}%\s*</text>)'

    $quality = @'
$1

      {/* Calidad de agua */}
      <g data-role="tank-water-quality" style={{ pointerEvents: "none" }}>
        <rect
          x={W / 2 - 72}
          y={151}
          width={144}
          height={38}
          rx={9}
          fill="#ffffff"
          fillOpacity={0.96}
          stroke="#94a3b8"
          strokeWidth={1.2}
        />

        <line
          x1={W / 2}
          y1={155}
          x2={W / 2}
          y2={185}
          stroke="#e2e8f0"
          strokeWidth={1}
        />

        <text
          x={W / 2 - 60}
          y={164}
          fill="#64748b"
          style={{ fontSize: 9, fontWeight: 900 }}
        >
          CLORO
        </text>

        <text
          x={W / 2 - 60}
          y={181}
          fill="#0f172a"
          style={{ fontSize: 12, fontWeight: 950 }}
        >
          {chlorineText}
        </text>

        <text
          x={W / 2 + 12}
          y={164}
          fill="#64748b"
          style={{ fontSize: 9, fontWeight: 900 }}
        >
          pH
        </text>

        <text
          x={W / 2 + 12}
          y={181}
          fill="#0f172a"
          style={{ fontSize: 12, fontWeight: 950 }}
        >
          {phText}
        </text>
      </g>
'@

    $newTxt = [regex]::Replace($txt, $pattern, $quality, 1)

    if ($newTxt -eq $txt) {
        throw "No pude insertar el bloque de calidad en el tanque normal."
    }

    $txt = $newTxt
}

# ============================================================
# 3) POZO
# ============================================================

if ($txt -notmatch 'data-role="well-water-quality"') {

    $patternPozo = '(?s)(<text\s+x=\{W / 2\}\s+y=\{179\}.*?>\s*\{level\.toFixed\(0\)\}%\s*</text>)'

    $qualityPozo = @'
$1

        <g data-role="well-water-quality" style={{ pointerEvents: "none" }}>
          <rect
            x={W / 2 - 76}
            y={204}
            width={152}
            height={42}
            rx={9}
            fill="#ffffff"
            fillOpacity={0.96}
            stroke="#94a3b8"
            strokeWidth={1.2}
          />

          <line
            x1={W / 2}
            y1={208}
            x2={W / 2}
            y2={242}
            stroke="#e2e8f0"
            strokeWidth={1}
          />

          <text
            x={W / 2 - 64}
            y={218}
            fill="#64748b"
            style={{ fontSize: 9, fontWeight: 900 }}
          >
            CLORO
          </text>

          <text
            x={W / 2 - 64}
            y={237}
            fill="#0f172a"
            style={{ fontSize: 12, fontWeight: 950 }}
          >
            {chlorineText}
          </text>

          <text
            x={W / 2 + 12}
            y={218}
            fill="#64748b"
            style={{ fontSize: 9, fontWeight: 900 }}
          >
            pH
          </text>

          <text
            x={W / 2 + 12}
            y={237}
            fill="#0f172a"
            style={{ fontSize: 12, fontWeight: 950 }}
          >
            {phText}
          </text>
        </g>
'@

    $txt = [regex]::Replace($txt, $patternPozo, $qualityPozo, 1)
}

Set-Content $tank $txt -Encoding UTF8

Write-Host ""
Write-Host "V17.4 aplicado." -ForegroundColor Green
Write-Host "Cloro residual y pH ahora quedan visibles dentro del tanque/pozo." -ForegroundColor Green
