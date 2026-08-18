$ErrorActionPreference = "Stop"

$repo = Get-Location
$infra = Join-Path $repo "FrontEnd\App_2\src\features\infra-diagram\InfraDiagram.tsx"

if (!(Test-Path $infra)) {
    throw "No encuentro InfraDiagram.tsx. Ejecuta este script desde la raiz de DiracInstrumentacion."
}

Write-Host "Leyendo InfraDiagram.tsx..." -ForegroundColor Cyan
$i = Get-Content $infra -Raw

# Inserta visibles antes de edgesForRender si todavía no existen
if ($i -notmatch 'const visibleNodes = useMemo') {
    $anchor = '  const edgesForRender: UIEdgeWithPorts[] = useMemo(() => {'

    if (-not $i.Contains($anchor)) {
        throw "No encontre el bloque edgesForRender esperado. No se hicieron cambios."
    }

    $block = @"
  const valveNodeIds = useMemo(
    () => new Set(nodes.filter((n) => n.type === "valve").map((n) => n.id)),
    [nodes]
  );

  const visibleNodes = useMemo(
    () => nodes.filter((n) => n.type !== "valve"),
    [nodes]
  );

"@

    $i = $i.Replace($anchor, $block + $anchor)
}

# Reemplaza el bloque exacto de edgesForRender
$old = @"
  const edgesForRender: UIEdgeWithPorts[] = useMemo(() => {
    return simulateFlow(edges, nodesById);
  }, [edges, nodesById]);
"@

$new = @"
  const edgesForRender: UIEdgeWithPorts[] = useMemo(() => {
    return simulateFlow(edges, nodesById).filter(
      (e) => !valveNodeIds.has(e.a) && !valveNodeIds.has(e.b)
    );
  }, [edges, nodesById, valveNodeIds]);
"@

if ($i.Contains($old)) {
    $i = $i.Replace($old, $new)
}
elseif ($i -notmatch 'valveNodeIds\.has\(e\.a\)') {
    Write-Host "Aviso: no pude reemplazar el bloque edgesForRender exacto." -ForegroundColor Yellow
}

# Render principal
$i = $i.Replace('{nodes.map((n) =>', '{visibleNodes.map((n) =>')

# Modo conectar
$i = $i.Replace('                  nodes.map((n) => {', '                  visibleNodes.map((n) => {')

Set-Content $infra $i -Encoding UTF8

Write-Host ""
Write-Host "Listo: valvulas ocultas en el sinoptico." -ForegroundColor Green
Write-Host "No se borro nada de Supabase." -ForegroundColor Green
Write-Host ""
Write-Host "Ahora ejecuta:"
Write-Host "  cd FrontEnd\App_2"
Write-Host "  npm run dev"
