$ErrorActionPreference = "Stop"

$path = ".\FrontEnd\App_2\src\features\infra-diagram\InfraDiagram.tsx"

if (!(Test-Path $path)) {
    throw "No encuentro $path. Ejecutá desde la raíz de DiracInstrumentacion."
}

$txt = Get-Content $path -Raw

Write-Host "Aplicando V18.38 - fondo limpio y dibujo completo..." -ForegroundColor Cyan

$changes = 0

# ============================================================
# 1) Fondo general del lienzo: blanco, sin panel gris interno
# ============================================================
$oldRect = '<rect x={vb.minx} y={vb.miny} width={vb.w} height={vb.h} fill="#f3f6f9" />'
if ($txt.Contains($oldRect)) {
    $txt = $txt.Replace(
        $oldRect,
        '<rect x={vb.minx} y={vb.miny} width={vb.w} height={vb.h} fill="#ffffff" />'
    )
    $changes++
}

# Sacar la grilla casi por completo.
$oldGrid = '<rect x={vb.minx} y={vb.miny} width={vb.w} height={vb.h} fill="url(#grid)" opacity={0.03} />'
if ($txt.Contains($oldGrid)) {
    $txt = $txt.Replace(
        $oldGrid,
        '<rect x={vb.minx} y={vb.miny} width={vb.w} height={vb.h} fill="url(#grid)" opacity={0.012} />'
    )
    $changes++
}

# ============================================================
# 2) Contenedor sin borde gris / recuadro visual
# ============================================================
$txt2 = $txt.Replace(
    'border: "1px solid #e2e8f0",',
    'border: "none",'
)
if ($txt2 -ne $txt) {
    $txt = $txt2
    $changes++
}

$txt2 = $txt.Replace(
    'borderRadius: 12,',
    'borderRadius: 0,'
)
if ($txt2 -ne $txt) {
    $txt = $txt2
    $changes++
}

# ============================================================
# 3) Que cargue mostrando TODO el dibujo.
#    El SVG ya tiene viewBox calculado, por eso initialScale 3.35
#    vuelve a hacer zoom y corta visualmente el conjunto.
# ============================================================
$oldTransform = '<TransformWrapper initialScale={3.35} minScale={0.6} maxScale={ZOOM_MAX} centerOnInit wheel={{ step: 0.1 }}>'
$newTransform = '<TransformWrapper initialScale={1} minScale={0.35} maxScale={ZOOM_MAX} centerOnInit wheel={{ step: 0.1 }}>'
if ($txt.Contains($oldTransform)) {
    $txt = $txt.Replace($oldTransform, $newTransform)
    $changes++
} else {
    # fallback tolerante
    $before = $txt
    $txt = [regex]::Replace(
        $txt,
        '<TransformWrapper\s+initialScale=\{[0-9.]+\}\s+minScale=\{[0-9.]+\}\s+maxScale=\{ZOOM_MAX\}\s+centerOnInit\s+wheel=\{\{\s*step:\s*0\.1\s*\}\}>',
        '<TransformWrapper initialScale={1} minScale={0.35} maxScale={ZOOM_MAX} centerOnInit wheel={{ step: 0.1 }}>'
    )
    if ($txt -ne $before) { $changes++ }
}

# ============================================================
# 4) Dar más margen al bounding box para que no se corten
#    textos, bombas laterales, analizadores o banderines.
# ============================================================
$oldPad = '    const pad = 120;'
if ($txt.Contains($oldPad)) {
    $txt = $txt.Replace($oldPad, '    const pad = 240;')
    $changes++
}

# ============================================================
# 5) Asegurar que SVG ocupe todo el área disponible
# ============================================================
$oldSvgStyle = 'style={{ display: "block" }}'
$newSvgStyle = 'style={{ display: "block", width: "100%", height: "100%", background: "#ffffff" }}'
if ($txt.Contains($oldSvgStyle)) {
    $txt = $txt.Replace($oldSvgStyle, $newSvgStyle)
    $changes++
}

# TransformComponent también sin fondo ni límites visuales
$oldTransformComponent = '<TransformComponent wrapperStyle={{ width: "100%", height: "100%" }}>'
$newTransformComponent = '<TransformComponent wrapperStyle={{ width: "100%", height: "100%", background: "#ffffff" }} contentStyle={{ width: "100%", height: "100%" }}>'
if ($txt.Contains($oldTransformComponent)) {
    $txt = $txt.Replace($oldTransformComponent, $newTransformComponent)
    $changes++
}

if ($changes -eq 0) {
    throw "No encontré los estilos esperados. No hice cambios."
}

Set-Content $path $txt -Encoding UTF8

Write-Host ""
Write-Host "V18.38 aplicado correctamente." -ForegroundColor Green
Write-Host ""
Write-Host "Cambios:" -ForegroundColor Cyan
Write-Host "- fondo blanco uniforme"
Write-Host "- sin recuadro gris interno"
Write-Host "- sin borde del lienzo"
Write-Host "- zoom inicial 1: muestra todo el dibujo"
Write-Host "- margen del viewBox aumentado a 240"
Write-Host "- zoom mínimo 0.35 para poder alejar más"
Write-Host ""
Write-Host "Probá:" -ForegroundColor Yellow
Write-Host "cd FrontEnd\App_2"
Write-Host "npm run dev"
