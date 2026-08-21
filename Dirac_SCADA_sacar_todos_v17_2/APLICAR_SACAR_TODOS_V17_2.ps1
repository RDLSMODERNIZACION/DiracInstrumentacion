$ErrorActionPreference = "Stop"

$repo = Get-Location
$infra = Join-Path $repo "FrontEnd\App_2\src\features\infra-diagram\InfraDiagram.tsx"

if (!(Test-Path $infra)) {
    throw "No encuentro InfraDiagram.tsx. Ejecutá desde la raíz de DiracInstrumentacion."
}

$txt = Get-Content $infra -Raw

Write-Host "Aplicando V17.2 - sacar pestaña Todos..." -ForegroundColor Cyan

# Estado: Agua por defecto, sin union con 'todos'
$txt = [regex]::Replace(
    $txt,
    'const \[activeServicio, setActiveServicio\] = useState<"todos" \| ServicioSCADA>\("todos"\);',
    'const [activeServicio, setActiveServicio] = useState<ServicioSCADA>("agua");'
)

# Sacar opción Todos, tolerante a espacios/formato
$txt = [regex]::Replace(
    $txt,
    '\s*\["todos",\s*"Todos"\],',
    ''
)

# Sacar cualquier fallback que muestre todos
$txt = $txt.Replace(
'        if (activeServicio === "todos") return true;
',
''
)

Set-Content $infra $txt -Encoding UTF8

Write-Host ""
Write-Host "V17.2 aplicado." -ForegroundColor Green
Write-Host "Quedan solo Agua / Cargaderos de agua / Cloacas." -ForegroundColor Green
