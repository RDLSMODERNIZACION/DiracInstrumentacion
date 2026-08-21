$ErrorActionPreference = "Stop"

$repo = Get-Location
$tank = Join-Path $repo "FrontEnd\App_2\src\features\infra-diagram\components\nodes\TankNodeView.tsx"
$pump = Join-Path $repo "FrontEnd\App_2\src\features\infra-diagram\components\nodes\PumpNodeView.tsx"

foreach ($f in @($tank,$pump)) {
    if (!(Test-Path $f)) {
        throw "No encuentro $f. Ejecutá desde la raíz de DiracInstrumentacion."
    }
}

Write-Host "Aplicando V17.3 - calidad de agua + datos de motor..." -ForegroundColor Cyan

# ============================================================
# TANQUES: Cloro residual + pH
# ============================================================
$t = Get-Content $tank -Raw

# Extender tipo si hace falta
if ($t -notmatch 'chlorine_mg_l') {
    $t = $t.Replace(
'    servicio?: "agua" | "cargaderos" | "cloacas" | null;',
'    servicio?: "agua" | "cargaderos" | "cloacas" | null;
    chlorine_mg_l?: number | string | null;
    ph?: number | string | null;'
    )
}

# Agregar helpers de calidad después de level
if ($t -notmatch 'const chlorineText =') {
    $anchor = '  const level = Math.max(0, Math.min(100, levelRaw ?? 0));'

    $block = @'

  const chlorineRaw = Number((n as any).chlorine_mg_l);
  const phRaw = Number((n as any).ph);

  const chlorineText =
    Number.isFinite(chlorineRaw) ? `${chlorineRaw.toFixed(2)} mg/L` : "-- mg/L";

  const phText =
    Number.isFinite(phRaw) ? phRaw.toFixed(2) : "--";
'@

    $t = $t.Replace($anchor, $anchor + $block)
}

# POZO: insertar bloque de calidad después de placa de nivel
$pozoAnchor = @'
        <text
          x={W / 2}
          y={179}
          textAnchor="middle"
          fill="#0f172a"
          style={{
            fontSize: 32,
            fontWeight: 950,
            pointerEvents: "none",
          }}
        >
          {level.toFixed(0)}%
        </text>
'@

if ($t.Contains($pozoAnchor) -and $t -notmatch 'Cl₂.*chlorineText') {
    $pozoQuality = @'

        {/* Calidad de agua */}
        <rect
          x={W / 2 - 70}
          y={208}
          width={140}
          height={52}
          rx={9}
          fill="#ffffff"
          fillOpacity={0.86}
          stroke="#cbd5e1"
          strokeWidth={1.1}
        />

        <text
          x={W / 2 - 58}
          y={228}
          fill="#475569"
          style={{ fontSize: 12, fontWeight: 800, pointerEvents: "none" }}
        >
          Cl₂
        </text>

        <text
          x={W / 2 + 58}
          y={228}
          textAnchor="end"
          fill="#0f172a"
          style={{ fontSize: 12, fontWeight: 900, pointerEvents: "none" }}
        >
          {chlorineText}
        </text>

        <text
          x={W / 2 - 58}
          y={248}
          fill="#475569"
          style={{ fontSize: 12, fontWeight: 800, pointerEvents: "none" }}
        >
          pH
        </text>

        <text
          x={W / 2 + 58}
          y={248}
          textAnchor="end"
          fill="#0f172a"
          style={{ fontSize: 12, fontWeight: 900, pointerEvents: "none" }}
        >
          {phText}
        </text>
'@

    $t = $t.Replace($pozoAnchor, $pozoAnchor + $pozoQuality)
}

# TANQUE normal: insertar bloque calidad debajo del nivel
$normalAnchor = @'
      <text
        x={W / 2}
        y={135}
        textAnchor="middle"
        fill="#0f172a"
        style={{
          fontSize: 32,
          fontWeight: 950,
          pointerEvents: "none",
        }}
      >
        {level.toFixed(0)}%
      </text>
'@

if ($t.Contains($normalAnchor) -and ($t -notmatch 'y=\{163\}')) {
    $normalQuality = @'

      {/* Calidad de agua dentro del tanque */}
      <rect
        x={W / 2 - 72}
        y={154}
        width={144}
        height={34}
        rx={8}
        fill="#ffffff"
        fillOpacity={0.86}
        stroke="#cbd5e1"
        strokeWidth={1}
      />

      <text
        x={W / 2 - 60}
        y={168}
        fill="#475569"
        style={{ fontSize: 11, fontWeight: 800, pointerEvents: "none" }}
      >
        Cl₂
      </text>

      <text
        x={W / 2 + 60}
        y={168}
        textAnchor="end"
        fill="#0f172a"
        style={{ fontSize: 11, fontWeight: 900, pointerEvents: "none" }}
      >
        {chlorineText}
      </text>

      <text
        x={W / 2 - 60}
        y={182}
        fill="#475569"
        style={{ fontSize: 11, fontWeight: 800, pointerEvents: "none" }}
      >
        pH
      </text>

      <text
        x={W / 2 + 60}
        y={182}
        textAnchor="end"
        fill="#0f172a"
        style={{ fontSize: 11, fontWeight: 900, pointerEvents: "none" }}
      >
        {phText}
      </text>
'@

    $t = $t.Replace($normalAnchor, $normalAnchor + $normalQuality)
}

Set-Content $tank $t -Encoding UTF8


# ============================================================
# BOMBAS: M / amperes, sin ON/OFF
# ============================================================
$p = Get-Content $pump -Raw

# Agregar amperaje preparado para futuro dato real
if ($p -notmatch 'const currentText =') {
    $anchor = '  const maintenance = (n as any).in_maintenance === true;'

    $block = @'

  // Por ahora el modo queda hardcodeado en MANUAL.
  // Más adelante puede reemplazarse por dato real del PLC.
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

    $p = $p.Replace($anchor, $anchor + $block)
}

# Eliminar variables visuales de estado que ya no hacen falta
$p = [regex]::Replace(
    $p,
    '(?m)^\s*const statusFill = .*?;\r?\n',
    ''
)
$p = [regex]::Replace(
    $p,
    '(?m)^\s*const statusText = .*?;\r?\n',
    ''
)

# HORIZONTAL: reemplazar pill ON/OFF por M + amperes
$horizontalOld = @'
        <rect
          x={-23}
          y={41}
          width={46}
          height={16}
          rx={8}
          fill={statusFill}
          style={{ pointerEvents: "none" }}
        />
        <text
          x={0}
          y={53}
          textAnchor="middle"
          fill="#fff"
          style={{ fontSize: 10, fontWeight: 900, pointerEvents: "none" }}
        >
          {statusText}
        </text>
'@

$horizontalNew = @'
        {/* Modo + corriente. Sin indicador ON/OFF: el giro ya indica marcha. */}
        <rect
          x={-42}
          y={41}
          width={22}
          height={17}
          rx={7}
          fill="#e2e8f0"
          stroke="#94a3b8"
          strokeWidth={1}
          style={{ pointerEvents: "none" }}
        />
        <text
          x={-31}
          y={53}
          textAnchor="middle"
          fill="#334155"
          style={{ fontSize: 10, fontWeight: 950, pointerEvents: "none" }}
        >
          {controlMode}
        </text>

        <text
          x={-12}
          y={53}
          textAnchor="start"
          fill="#334155"
          style={{ fontSize: 11, fontWeight: 900, pointerEvents: "none" }}
        >
          {currentText}
        </text>
'@

if ($p.Contains($horizontalOld)) {
    $p = $p.Replace($horizontalOld, $horizontalNew)
} else {
    Write-Host "Aviso: no encontré exactamente el bloque de estado horizontal." -ForegroundColor Yellow
}

# VERTICAL
$verticalOld = @'
      <rect
        x={-23}
        y={54}
        width={46}
        height={16}
        rx={8}
        fill={statusFill}
        style={{ pointerEvents: "none" }}
      />
      <text
        x={0}
        y={66}
        textAnchor="middle"
        fill="#fff"
        style={{ fontSize: 10, fontWeight: 900, pointerEvents: "none" }}
      >
        {statusText}
      </text>
'@

$verticalNew = @'
      {/* Modo + corriente. Sin indicador ON/OFF. */}
      <rect
        x={-28}
        y={54}
        width={22}
        height={17}
        rx={7}
        fill="#e2e8f0"
        stroke="#94a3b8"
        strokeWidth={1}
        style={{ pointerEvents: "none" }}
      />
      <text
        x={-17}
        y={66}
        textAnchor="middle"
        fill="#334155"
        style={{ fontSize: 10, fontWeight: 950, pointerEvents: "none" }}
      >
        {controlMode}
      </text>

      <text
        x={0}
        y={66}
        textAnchor="start"
        fill="#334155"
        style={{ fontSize: 11, fontWeight: 900, pointerEvents: "none" }}
      >
        {currentText}
      </text>
'@

if ($p.Contains($verticalOld)) {
    $p = $p.Replace($verticalOld, $verticalNew)
} else {
    Write-Host "Aviso: no encontré exactamente el bloque de estado vertical." -ForegroundColor Yellow
}

Set-Content $pump $p -Encoding UTF8

Write-Host ""
Write-Host "V17.3 aplicado correctamente." -ForegroundColor Green
Write-Host "Tanques: Cloro residual + pH." -ForegroundColor Green
Write-Host "Bombas: M + amperes; se eliminó ON/OFF." -ForegroundColor Green
