$ErrorActionPreference = "Stop"

$repo = Get-Location
$infra = Join-Path $repo "FrontEnd\App_2\src\features\infra-diagram\InfraDiagram.tsx"

if (!(Test-Path $infra)) {
    throw "No encuentro InfraDiagram.tsx. Ejecutá desde la raíz de DiracInstrumentacion."
}

$txt = Get-Content $infra -Raw

Write-Host "Aplicando V17.1 - tabs limpias..." -ForegroundColor Cyan

# 1) Estado por defecto: Agua, sin "Todos"
$txt = $txt.Replace(
'const [activeServicio, setActiveServicio] = useState<"todos" | ServicioSCADA>("todos");',
'const [activeServicio, setActiveServicio] = useState<ServicioSCADA>("agua");'
)

# 2) Filtro: siempre una sola categoría
$oldFilter = @'
  const visibleNodes = useMemo(
    () =>
      nodes.filter((n) => {
        if (n.type === "valve") return false;
        if (activeServicio === "todos") return true;
        return ((n as any).servicio ?? "agua") === activeServicio;
      }),
    [nodes, activeServicio]
  );
'@

$newFilter = @'
  const visibleNodes = useMemo(
    () =>
      nodes.filter((n) => {
        if (n.type === "valve") return false;
        return ((n as any).servicio ?? "agua") === activeServicio;
      }),
    [nodes, activeServicio]
  );
'@

if ($txt.Contains($oldFilter)) {
    $txt = $txt.Replace($oldFilter, $newFilter)
}

# 3) Quitar botón "Todos"
$txt = $txt.Replace(
'            ["todos", "Todos"],
            ["agua", "Agua"],
            ["cargaderos", "Cargaderos de agua"],
            ["cloacas", "Cloacas"],',
'            ["agua", "Agua"],
            ["cargaderos", "Cargaderos de agua"],
            ["cloacas", "Cloacas"],'
)

# 4) Quitar "Actualizando..." y "Sincronizado"
$oldStatus = @'
        {error ? (
          <span style={{ color: "#b91c1c" }}>Error: {(error as Error)?.message || "Error desconocido"}</span>
        ) : isFetching ? (
          "Actualizando…"
        ) : (
          "Sincronizado"
        )}
'@

$newStatus = @'
        {error && (
          <span style={{ color: "#b91c1c" }}>
            Error: {(error as Error)?.message || "Error desconocido"}
          </span>
        )}
'@

if ($txt.Contains($oldStatus)) {
    $txt = $txt.Replace($oldStatus, $newStatus)
} else {
    # fallback tolerante
    $txt = [regex]::Replace(
        $txt,
        '(?s)\{error \? \(.*?\) : isFetching \? \(.*?\) : \(.*?\)\}',
        '{error && (<span style={{ color: "#b91c1c" }}>Error: {(error as Error)?.message || "Error desconocido"}</span>)}',
        1
    )
}

Set-Content $infra $txt -Encoding UTF8

Write-Host ""
Write-Host "V17.1 aplicado." -ForegroundColor Green
Write-Host "Quedan solo: Agua / Cargaderos de agua / Cloacas." -ForegroundColor Green
Write-Host "Se eliminaron Actualizando y Sincronizado." -ForegroundColor Green
