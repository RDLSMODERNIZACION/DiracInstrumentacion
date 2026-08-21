$ErrorActionPreference = "Stop"

$path = ".\FrontEnd\App_1\src\widget\index.tsx"

if (!(Test-Path $path)) {
    throw "No encuentro $path. Ejecutá desde la raíz de DiracInstrumentacion."
}

$txt = Get-Content $path -Raw

Write-Host "Aplicando V18.17 - Auditoría solo en Operación..." -ForegroundColor Cyan

$marker = '{/* V18.16 AUDITORIA */}'
$start = $txt.IndexOf($marker)

if ($start -lt 0) {
    throw "No encontré el bloque V18.16 AUDITORIA en index.tsx."
}

$nextCandidates = @(
    '{tab === "eficiencia" && (',
    '{tab === "confiabilidad" && (',
    '{tab === "calidad" && (',
    '{tab === "gestion" && ('
)

$end = -1

foreach ($candidate in $nextCandidates) {
    $pos = $txt.IndexOf($candidate, $start + $marker.Length)
    if ($pos -ge 0 -and ($end -lt 0 -or $pos -lt $end)) {
        $end = $pos
    }
}

if ($end -lt 0) {
    throw "No pude encontrar el final de la sección de Auditoría."
}

$auditBlock = $txt.Substring($start, $end - $start)

$wrapped = @'
      {tab === "operacion" && (
        <>

'@ + $auditBlock + @'

        </>
      )}

'@

$txt = $txt.Substring(0, $start) + $wrapped + $txt.Substring($end)

Set-Content $path $txt -Encoding UTF8

Write-Host ""
Write-Host "V18.17 aplicado correctamente." -ForegroundColor Green
Write-Host "Auditoría comparativa ahora se muestra únicamente en Operación." -ForegroundColor Green
