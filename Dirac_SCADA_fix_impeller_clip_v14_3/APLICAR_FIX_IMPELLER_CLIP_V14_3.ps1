$ErrorActionPreference = "Stop"

$repo = Get-Location
$pump = Join-Path $repo "FrontEnd\App_2\src\features\infra-diagram\components\nodes\PumpNodeView.tsx"

if (!(Test-Path $pump)) {
    throw "No encuentro PumpNodeView.tsx. Ejecutá esto desde la raíz de DiracInstrumentacion."
}

$txt = Get-Content $pump -Raw

Write-Host "Corrigiendo aspas para que queden dentro del círculo..." -ForegroundColor Cyan

# 1) Agregar clip ids si todavía no están
if ($txt -notmatch 'const clipIdH =') {
    $anchor = '  const tipLines = ['
    $insert = @'
  const safeId = String(n.id).replace(/[^a-zA-Z0-9_-]/g, "_");
  const clipIdH = `pump-impeller-h-${safeId}`;
  const clipIdV = `pump-impeller-v-${safeId}`;

'@
    $txt = $txt.Replace($anchor, $insert + $anchor)
}

# 2) Reemplazar bloque horizontal
$oldH = @'
        <circle cx={43} cy={5} r={18} fill="#f8fafc"
          stroke={motorStroke} strokeWidth={tapSelected ? 3.6 : 2.4} style={{ pointerEvents: "none" }} />

        <g transform="translate(43 5)" style={{ pointerEvents: "none" }}>
          {[0,90,180,270].map((deg) => (
            <path key={deg}
              d="M 0 -11 C 6 -10 9 -5 5 -1 L 0 0 Z"
              transform={`rotate(${deg})`}
              fill={running && online ? "#0ea5e9" : "#94a3b8"} />
          ))}
          <circle r={3} fill={running && online ? "#0284c7" : "#64748b"} />
          {running && online && (
            <animateTransform attributeName="transform" type="rotate"
              from="0 0 0" to="360 0 0" dur="0.9s" repeatCount="indefinite" />
          )}
        </g>
'@

$newH = @'
        <defs>
          <clipPath id={clipIdH}>
            <circle cx={43} cy={5} r={15.5} />
          </clipPath>
        </defs>

        <circle cx={43} cy={5} r={18} fill="#f8fafc"
          stroke={motorStroke} strokeWidth={tapSelected ? 3.6 : 2.4} style={{ pointerEvents: "none" }} />

        <g clipPath={`url(#${clipIdH})`} style={{ pointerEvents: "none" }}>
          <g transform="translate(43 5)">
            {[0,90,180,270].map((deg) => (
              <path key={deg}
                d="M 0 -8.8 C 4.8 -8.2 7.2 -4.1 3.8 -1.0 L 0 0 Z"
                transform={`rotate(${deg})`}
                fill={running && online ? "#0ea5e9" : "#94a3b8"} />
            ))}
            <circle r={2.8} fill={running && online ? "#0284c7" : "#64748b"} />
            {running && online && (
              <animateTransform attributeName="transform" type="rotate"
                from="0 0 0" to="360 0 0" dur="0.9s" repeatCount="indefinite" />
            )}
          </g>
        </g>
'@

if ($txt.Contains($oldH)) {
    $txt = $txt.Replace($oldH, $newH)
} else {
    Write-Host "Aviso: no encontré el bloque horizontal exacto." -ForegroundColor Yellow
}

# 3) Reemplazar bloque vertical
$oldV = @'
      <circle cx={0} cy={20} r={17} fill="#f8fafc"
        stroke={motorStroke} strokeWidth={tapSelected ? 3.6 : 2.3} style={{ pointerEvents: "none" }} />

      <g transform="translate(0 20)" style={{ pointerEvents: "none" }}>
        {[0,90,180,270].map((deg) => (
          <path key={deg}
            d="M 0 -10 C 5 -9 8 -4 4 -1 L 0 0 Z"
            transform={`rotate(${deg})`}
            fill={running && online ? "#0ea5e9" : "#94a3b8"} />
        ))}
        <circle r={3} fill={running && online ? "#0284c7" : "#64748b"} />
        {running && online && (
          <animateTransform attributeName="transform" type="rotate"
            from="0 0 0" to="360 0 0" dur="0.9s" repeatCount="indefinite" />
        )}
      </g>
'@

$newV = @'
      <defs>
        <clipPath id={clipIdV}>
          <circle cx={0} cy={20} r={14.5} />
        </clipPath>
      </defs>

      <circle cx={0} cy={20} r={17} fill="#f8fafc"
        stroke={motorStroke} strokeWidth={tapSelected ? 3.6 : 2.3} style={{ pointerEvents: "none" }} />

      <g clipPath={`url(#${clipIdV})`} style={{ pointerEvents: "none" }}>
        <g transform="translate(0 20)">
          {[0,90,180,270].map((deg) => (
            <path key={deg}
              d="M 0 -8.0 C 4.4 -7.4 6.8 -3.8 3.4 -1.0 L 0 0 Z"
              transform={`rotate(${deg})`}
              fill={running && online ? "#0ea5e9" : "#94a3b8"} />
          ))}
          <circle r={2.8} fill={running && online ? "#0284c7" : "#64748b"} />
          {running && online && (
            <animateTransform attributeName="transform" type="rotate"
              from="0 0 0" to="360 0 0" dur="0.9s" repeatCount="indefinite" />
          )}
        </g>
      </g>
'@

if ($txt.Contains($oldV)) {
    $txt = $txt.Replace($oldV, $newV)
} else {
    Write-Host "Aviso: no encontré el bloque vertical exacto." -ForegroundColor Yellow
}

Set-Content $pump $txt -Encoding UTF8

Write-Host ""
Write-Host "Listo. Las aspas ahora quedan recortadas dentro del círculo." -ForegroundColor Green
Write-Host "También quedaron un poco más chicas para verse más prolijas." -ForegroundColor Green
