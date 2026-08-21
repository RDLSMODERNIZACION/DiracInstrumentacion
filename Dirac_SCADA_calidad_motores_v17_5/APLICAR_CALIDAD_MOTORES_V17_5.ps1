$ErrorActionPreference = "Stop"

$repo = Get-Location
$tank = Join-Path $repo "FrontEnd\App_2\src\features\infra-diagram\components\nodes\TankNodeView.tsx"
$pump = Join-Path $repo "FrontEnd\App_2\src\features\infra-diagram\components\nodes\PumpNodeView.tsx"

foreach ($f in @($tank,$pump)) {
    if (!(Test-Path $f)) {
        throw "No encuentro $f. Ejecutá desde la raíz de DiracInstrumentacion."
    }
}

Write-Host "Aplicando V17.5 - Cloro/pH + M y amperes, sin ON/OFF..." -ForegroundColor Cyan

# ============================================================
# TANK NODE
# ============================================================
$t = Get-Content $tank -Raw

# Tipo: agregar campos si faltan.
if ($t -notmatch 'chlorine_mg_l\?:') {
    $t = $t.Replace(
'    servicio?: "agua" | "cargaderos" | "cloacas" | null;',
'    servicio?: "agua" | "cargaderos" | "cloacas" | null;
    chlorine_mg_l?: number | string | null;
    ph?: number | string | null;'
    )
}

# Variables.
if ($t -notmatch 'const chlorineText =') {
    $anchor = '  const level = Math.max(0, Math.min(100, levelRaw ?? 0));'
    if (!$t.Contains($anchor)) {
        throw "No encontré el cálculo de level en TankNodeView.tsx"
    }

    $vars = @'

  const chlorineRaw = Number((n as any).chlorine_mg_l);
  const phRaw = Number((n as any).ph);

  const chlorineText =
    Number.isFinite(chlorineRaw) ? `${chlorineRaw.toFixed(2)} mg/L` : "-- mg/L";

  const phText =
    Number.isFinite(phRaw) ? phRaw.toFixed(2) : "--";
'@

    $t = $t.Replace($anchor, $anchor + $vars)
}

# POZO: insertar calidad después del porcentaje.
if ($t -notmatch 'data-role="well-quality"') {
    $patternPozo = '(?s)(<text\s+x=\{W / 2\}\s+y=\{179\}.*?>\s*\{level\.toFixed\(0\)\}%\s*</text>)'

    $pozoBlock = @'
$1

        <g data-role="well-quality" style={{ pointerEvents: "none" }}>
          <rect
            x={W / 2 - 82}
            y={205}
            width={164}
            height={44}
            rx={10}
            fill="#ffffff"
            fillOpacity={0.96}
            stroke="#94a3b8"
            strokeWidth={1.2}
          />

          <line
            x1={W / 2}
            y1={210}
            x2={W / 2}
            y2={244}
            stroke="#e2e8f0"
            strokeWidth={1}
          />

          <text
            x={W / 2 - 68}
            y={219}
            fill="#64748b"
            style={{ fontSize: 9, fontWeight: 900 }}
          >
            CLORO
          </text>

          <text
            x={W / 2 - 68}
            y={239}
            fill="#0f172a"
            style={{ fontSize: 12, fontWeight: 950 }}
          >
            {chlorineText}
          </text>

          <text
            x={W / 2 + 14}
            y={219}
            fill="#64748b"
            style={{ fontSize: 9, fontWeight: 900 }}
          >
            pH
          </text>

          <text
            x={W / 2 + 14}
            y={239}
            fill="#0f172a"
            style={{ fontSize: 12, fontWeight: 950 }}
          >
            {phText}
          </text>
        </g>
'@

    $next = [regex]::Replace($t, $patternPozo, $pozoBlock, 1)
    if ($next -ne $t) { $t = $next }
}

# TANQUE: insertar calidad después del porcentaje.
if ($t -notmatch 'data-role="tank-quality"') {
    $patternTank = '(?s)(<text\s+x=\{W / 2\}\s+y=\{135\}.*?>\s*\{level\.toFixed\(0\)\}%\s*</text>)'

    $tankBlock = @'
$1

      <g data-role="tank-quality" style={{ pointerEvents: "none" }}>
        <rect
          x={W / 2 - 80}
          y={153}
          width={160}
          height={36}
          rx={9}
          fill="#ffffff"
          fillOpacity={0.96}
          stroke="#94a3b8"
          strokeWidth={1.1}
        />

        <line
          x1={W / 2}
          y1={157}
          x2={W / 2}
          y2={185}
          stroke="#e2e8f0"
          strokeWidth={1}
        />

        <text
          x={W / 2 - 66}
          y={165}
          fill="#64748b"
          style={{ fontSize: 8.5, fontWeight: 900 }}
        >
          CLORO
        </text>

        <text
          x={W / 2 - 66}
          y={181}
          fill="#0f172a"
          style={{ fontSize: 11, fontWeight: 950 }}
        >
          {chlorineText}
        </text>

        <text
          x={W / 2 + 14}
          y={165}
          fill="#64748b"
          style={{ fontSize: 8.5, fontWeight: 900 }}
        >
          pH
        </text>

        <text
          x={W / 2 + 14}
          y={181}
          fill="#0f172a"
          style={{ fontSize: 11, fontWeight: 950 }}
        >
          {phText}
        </text>
      </g>
'@

    $next = [regex]::Replace($t, $patternTank, $tankBlock, 1)
    if ($next -eq $t) {
        throw "No pude insertar Cloro/pH en el tanque normal."
    }
    $t = $next
}

Set-Content $tank $t -Encoding UTF8


# ============================================================
# PUMP NODE
# ============================================================
$p = Get-Content $pump -Raw

# Variables M + amperes
if ($p -notmatch 'const controlMode = "M"') {
    $anchor = '  const maintenance = (n as any).in_maintenance === true;'
    if (!$p.Contains($anchor)) {
        throw "No encontré maintenance en PumpNodeView.tsx"
    }

    $vars = @'

  // Por ahora queda hardcodeado en Manual.
  // Cuando llegue la variable real del PLC, se reemplaza por M/R dinámico.
  const controlMode = "M";

  const currentRaw = Number(
    (n as any).current_a ??
    (n as any).amperes ??
    (n as any).current ??
    NaN
  );

  const currentText =
    Number.isFinite(currentRaw) ? `${currentRaw.toFixed(1)} A` : "-- A";
'@

    $p = $p.Replace($anchor, $anchor + $vars)
}

# Quitar variables de ON/OFF si existen.
$p = [regex]::Replace(
    $p,
    '(?s)\n\s*const statusFill = !online.*?;\s*\n\s*const statusText = !online.*?;\s*\n',
    "`n",
    1
)

# Horizontal: reemplazar bloque de status inferior por M + A.
$horizontalPattern = '(?s)\s*<rect\s+x=\{-23\}\s+y=\{41\}\s+width=\{46\}\s+height=\{16\}.*?</text>'

$horizontalReplacement = @'

        {/* Modo de control + corriente. Sin ON/OFF. */}
        <g style={{ pointerEvents: "none" }}>
          <rect
            x={-42}
            y={41}
            width={22}
            height={17}
            rx={7}
            fill="#e2e8f0"
            stroke="#94a3b8"
            strokeWidth={1}
          />
          <text
            x={-31}
            y={53}
            textAnchor="middle"
            fill="#334155"
            style={{ fontSize: 10, fontWeight: 950 }}
          >
            {controlMode}
          </text>

          <text
            x={-12}
            y={53}
            textAnchor="start"
            fill="#334155"
            style={{ fontSize: 11, fontWeight: 900 }}
          >
            {currentText}
          </text>
        </g>
'@

$next = [regex]::Replace($p, $horizontalPattern, $horizontalReplacement, 1)
if ($next -ne $p) { $p = $next }

# Vertical: reemplazar bloque inferior.
$verticalPattern = '(?s)\s*<rect\s+x=\{-23\}\s+y=\{54\}\s+width=\{46\}\s+height=\{16\}.*?</text>'

$verticalReplacement = @'

      {/* Modo de control + corriente. Sin ON/OFF. */}
      <g style={{ pointerEvents: "none" }}>
        <rect
          x={-30}
          y={54}
          width={22}
          height={17}
          rx={7}
          fill="#e2e8f0"
          stroke="#94a3b8"
          strokeWidth={1}
        />
        <text
          x={-19}
          y={66}
          textAnchor="middle"
          fill="#334155"
          style={{ fontSize: 10, fontWeight: 950 }}
        >
          {controlMode}
        </text>

        <text
          x={-2}
          y={66}
          textAnchor="start"
          fill="#334155"
          style={{ fontSize: 11, fontWeight: 900 }}
        >
          {currentText}
        </text>
      </g>
'@

$next = [regex]::Replace($p, $verticalPattern, $verticalReplacement, 1)
if ($next -eq $p) {
    throw "No pude reemplazar el indicador ON/OFF de la bomba vertical."
}
$p = $next

# Tooltip: agregar M y corriente.
if ($p -notmatch 'Modo: \$\{controlMode') {
    $p = $p.Replace(
'    `Montaje: ${orientation === "horizontal" ? "Horizontal" : "Vertical"}`,
',
'    `Montaje: ${orientation === "horizontal" ? "Horizontal" : "Vertical"}`,
    `Modo: ${controlMode === "M" ? "Manual" : "Remoto"}`,
    `Corriente: ${currentText}`,
'
    )
}

Set-Content $pump $p -Encoding UTF8

Write-Host ""
Write-Host "V17.5 aplicado correctamente." -ForegroundColor Green
Write-Host "Tanques: Cloro residual + pH visibles." -ForegroundColor Green
Write-Host "Bombas: M + amperes, sin ON/OFF." -ForegroundColor Green
