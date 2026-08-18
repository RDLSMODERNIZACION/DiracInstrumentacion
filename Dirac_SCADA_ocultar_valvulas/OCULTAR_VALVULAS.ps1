$ErrorActionPreference = "Stop"

$root = Get-Location
$infra = Join-Path $root "FrontEnd\App_2\src\features\infra-diagram\InfraDiagram.tsx"

if (!(Test-Path $infra)) {
    throw "No encuentro FrontEnd\App_2\src\features\infra-diagram\InfraDiagram.tsx. Ejecuta este script desde la raiz de DiracInstrumentacion."
}

$i = Get-Content $infra -Raw

Write-Host "Ocultando valvulas del sinoptico..." -ForegroundColor Cyan

# 1) Filtrar valvulas del render de nodos.
# Reemplaza el map principal de nodos por un map sobre nodos visibles.
if ($i -notmatch 'const visibleNodes = useMemo') {
    $anchor = 'const edgesForRender: UIEdgeWithPorts[] = useMemo(() => {'}

    $block = @'
  const valveNodeIds = useMemo(
    () => new Set(nodes.filter((n) => n.type === "valve").map((n) => n.id)),
    [nodes]
  );

  const visibleNodes = useMemo(
    () => nodes.filter((n) => n.type !== "valve"),
    [nodes]
  );

'@

    $i = $i.Replace($anchor, $block + $anchor)
}

# 2) Filtrar tambien las cañerias que terminan directamente en valvulas.
$oldEdgesMemo = @'
  const edgesForRender: UIEdgeWithPorts[] = useMemo(() => {
    return simulateFlow(edges, nodesById);
  }, [edges, nodesById]);
'@

$newEdgesMemo = @'
  const edgesForRender: UIEdgeWithPorts[] = useMemo(() => {
    return simulateFlow(edges, nodesById).filter(
      (e) => !valveNodeIds.has(e.a) && !valveNodeIds.has(e.b)
    );
  }, [edges, nodesById, valveNodeIds]);
'@

if ($i.Contains($oldEdgesMemo)) {
    $i = $i.Replace($oldEdgesMemo, $newEdgesMemo)
}
elseif ($i -notmatch 'valveNodeIds\.has\(e\.a\)') {
    Write-Host "Aviso: no encontre el bloque exacto de edgesForRender. No se toco ese bloque." -ForegroundColor Yellow
}

# 3) Renderizar solo nodos visibles.
$i = $i.Replace('{nodes.map((n) =>', '{visibleNodes.map((n) =>')

# 4) En modo conectar, tampoco mostrar puertos de valvulas.
$i = $i.Replace('nodes.map((n) => {', 'visibleNodes.map((n) => {')

Set-Content $infra $i -Encoding UTF8

Write-Host ""
Write-Host "Listo: valvulas ocultas y conexiones directas a valvulas ocultas." -ForegroundColor Green
Write-Host "No se borro nada de Supabase." -ForegroundColor Green
Write-Host ""
Write-Host "Ahora ejecuta:"
Write-Host "  cd FrontEnd\App_2"
Write-Host "  npm run dev"
