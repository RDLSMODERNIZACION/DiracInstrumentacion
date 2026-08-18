$ErrorActionPreference = "Stop"

$repo = Get-Location

$backend = Join-Path $repo "Backend\app\routes\infraestructura\layout.py"
$types = Join-Path $repo "FrontEnd\App_2\src\features\infra-diagram\types.ts"
$infra = Join-Path $repo "FrontEnd\App_2\src\features\infra-diagram\InfraDiagram.tsx"
$pumpView = Join-Path $repo "FrontEnd\App_2\src\features\infra-diagram\components\nodes\PumpNodeView.tsx"
$edge = Join-Path $repo "FrontEnd\App_2\src\features\infra-diagram\components\edges\EditableEdge.tsx"

foreach ($f in @($backend, $types, $infra, $pumpView, $edge)) {
    if (!(Test-Path $f)) {
        throw "No encuentro: $f. Ejecuta este script desde la raiz de DiracInstrumentacion."
    }
}

Write-Host "1/5 Backend: agregando orientacion al get_layout_combined..." -ForegroundColor Cyan
$b = Get-Content $backend -Raw

# Ruta sin company_id: join con pumps y campo orientacion
if ($b -notmatch "p\.orientacion::text AS orientacion" -and $b -notmatch "p\.orientacion AS orientacion") {
    $b = $b.Replace(
        "c.name, c.in_maintenance,`r`n                      CASE WHEN c.type = 'valve' THEN lv.meta ELSE NULL END AS meta,",
        "c.name, c.in_maintenance,`r`n                      CASE WHEN c.type = 'pump' THEN p.orientacion ELSE NULL END AS orientacion,`r`n                      CASE WHEN c.type = 'valve' THEN lv.meta ELSE NULL END AS meta,"
    )
    $b = $b.Replace(
        "LEFT JOIN public.layout_valves lv ON lv.node_id = c.node_id`r`n                    ORDER BY c.type, c.id",
        "LEFT JOIN public.layout_valves lv ON lv.node_id = c.node_id`r`n                    LEFT JOIN public.pumps p ON c.type = 'pump' AND p.id = c.id`r`n                    ORDER BY c.type, c.id"
    )

    # Fallback LF
    $b = $b.Replace(
        "c.name, c.in_maintenance,`n                      CASE WHEN c.type = 'valve' THEN lv.meta ELSE NULL END AS meta,",
        "c.name, c.in_maintenance,`n                      CASE WHEN c.type = 'pump' THEN p.orientacion ELSE NULL END AS orientacion,`n                      CASE WHEN c.type = 'valve' THEN lv.meta ELSE NULL END AS meta,"
    )
    $b = $b.Replace(
        "LEFT JOIN public.layout_valves lv ON lv.node_id = c.node_id`n                    ORDER BY c.type, c.id",
        "LEFT JOIN public.layout_valves lv ON lv.node_id = c.node_id`n                    LEFT JOIN public.pumps p ON c.type = 'pump' AND p.id = c.id`n                    ORDER BY c.type, c.id"
    )
}

# Ruta con company_id: agregar columna orientacion a cada CTE.
# Tanques
$b = $b.Replace(
"                    FALSE AS in_maintenance,`r`n                    l.id::bigint AS location_id,",
"                    FALSE AS in_maintenance,`r`n                    NULL::text AS orientacion,`r`n                    l.id::bigint AS location_id,"
)
$b = $b.Replace(
"                    FALSE AS in_maintenance,`n                    l.id::bigint AS location_id,",
"                    FALSE AS in_maintenance,`n                    NULL::text AS orientacion,`n                    l.id::bigint AS location_id,"
)

# Bombas: insertar después del EXISTS ... AS in_maintenance
$needleCRLF = @"
                    ) AS in_maintenance,
                    l.id::bigint AS location_id,
"@
$replCRLF = @"
                    ) AS in_maintenance,
                    p.orientacion::text AS orientacion,
                    l.id::bigint AS location_id,
"@
if ($b.Contains($needleCRLF)) {
    $b = $b.Replace($needleCRLF, $replCRLF)
}

# Para CTEs restantes que todavía no tengan orientacion antes de location_id
# Aplicamos por bloques de tipos conocidos, evitando duplicar.
foreach ($typeMarker in @("'valve'::text AS type", "'manifold'::text AS type", "'network_analyzer'::text AS type")) {
    $idx = $b.IndexOf($typeMarker)
    if ($idx -ge 0) {
        $next = $b.IndexOf("l.id::bigint AS location_id", $idx)
        if ($next -ge 0) {
            $chunkStart = [Math]::Max($idx, $next - 400)
            $chunk = $b.Substring($chunkStart, $next - $chunkStart)
            if ($chunk -notmatch "orientacion") {
                $b = $b.Insert($next, "NULL::text AS orientacion,`r`n                    ")
            }
        }
    }
}

# Final UNION selects
$b = $b.Replace(
"SELECT node_id,id,type,x,y,updated_at,online,state,level_pct,alarma,name,in_maintenance,location_id,location_name,meta,signals FROM t",
"SELECT node_id,id,type,x,y,updated_at,online,state,level_pct,alarma,name,in_maintenance,orientacion,location_id,location_name,meta,signals FROM t"
)
$b = $b.Replace(
"SELECT node_id,id,type,x,y,updated_at,online,state,level_pct,alarma,name,in_maintenance,location_id,location_name,meta,signals FROM p",
"SELECT node_id,id,type,x,y,updated_at,online,state,level_pct,alarma,name,in_maintenance,orientacion,location_id,location_name,meta,signals FROM p"
)
$b = $b.Replace(
"SELECT node_id,id,type,x,y,updated_at,online,state,level_pct,alarma,name,in_maintenance,location_id,location_name,meta,signals FROM v",
"SELECT node_id,id,type,x,y,updated_at,online,state,level_pct,alarma,name,in_maintenance,orientacion,location_id,location_name,meta,signals FROM v"
)
$b = $b.Replace(
"SELECT node_id,id,type,x,y,updated_at,online,state,level_pct,alarma,name,in_maintenance,location_id,location_name,meta,signals FROM m",
"SELECT node_id,id,type,x,y,updated_at,online,state,level_pct,alarma,name,in_maintenance,orientacion,location_id,location_name,meta,signals FROM m"
)
$b = $b.Replace(
"SELECT node_id,id,type,x,y,updated_at,online,state,level_pct,alarma,name,in_maintenance,location_id,location_name,meta,signals FROM na",
"SELECT node_id,id,type,x,y,updated_at,online,state,level_pct,alarma,name,in_maintenance,orientacion,location_id,location_name,meta,signals FROM na"
)

Set-Content $backend $b -Encoding UTF8

Write-Host "2/5 Frontend types: agregando orientacion..." -ForegroundColor Cyan
$t = Get-Content $types -Raw

if ($t -notmatch 'orientacion\?: "vertical" \| "horizontal"') {
    $t = $t.Replace(
        "  alarma?: string | null;`r`n",
        "  alarma?: string | null;`r`n  orientacion?: `"vertical`" | `"horizontal`" | null;`r`n"
    )
    $t = $t.Replace(
        "  alarma?: string | null;`n",
        "  alarma?: string | null;`n  orientacion?: `"vertical`" | `"horizontal`" | null;`n"
    )
}
Set-Content $types $t -Encoding UTF8

Write-Host "3/5 InfraDiagram: pasando orientacion al nodo UI..." -ForegroundColor Cyan
$i = Get-Content $infra -Raw

if ($i -notmatch 'orientacion: \(n as any\)\.orientacion') {
    $i = $i.Replace(
        "      in_maintenance: (n as any).in_maintenance ?? false,",
        "      in_maintenance: (n as any).in_maintenance ?? false,`r`n      orientacion: (n as any).orientacion ?? null,"
    )
}
Set-Content $infra $i -Encoding UTF8

Write-Host "4/5 PumpNodeView: usando orientacion de Supabase..." -ForegroundColor Cyan
$p = Get-Content $pumpView -Raw

# Soporta tanto V7 como V6.
$p = $p.Replace(
'    ((n as any).meta?.orientation as PumpOrientation) ||',
'    ((n as any).orientacion as PumpOrientation) ||`r`n    ((n as any).meta?.orientation as PumpOrientation) ||'
)
$p = $p.Replace(
'    ((n as any).orientation as PumpOrientation) ||',
'    ((n as any).orientation as PumpOrientation) ||'
)

# Si quedaron backticks literales por el Replace anterior, normalizarlos
$p = $p.Replace('||`r`n    ', "||`r`n    ")

Set-Content $pumpView $p -Encoding UTF8

Write-Host "5/5 EditableEdge: conexiones segun orientacion Supabase..." -ForegroundColor Cyan
$e = Get-Content $edge -Raw

$e = $e.Replace(
'((n as any).meta?.orientation ?? (n as any).orientation ?? "vertical")',
'((n as any).orientacion ?? (n as any).meta?.orientation ?? (n as any).orientation ?? "vertical")'
)

Set-Content $edge $e -Encoding UTF8

Write-Host ""
Write-Host "LISTO." -ForegroundColor Green
Write-Host "Ahora el flujo es:" -ForegroundColor Green
Write-Host "Supabase pumps.orientacion -> Backend get_layout_combined -> Frontend -> dibujo de bomba."
Write-Host ""
Write-Host "Verticales actuales en Supabase: Bomba Pozo y Pozo YPF." -ForegroundColor Yellow
Write-Host "El resto queda horizontal." -ForegroundColor Yellow
Write-Host ""
Write-Host "Para probar frontend:"
Write-Host "  cd FrontEnd\App_2"
Write-Host "  npm run dev"
Write-Host ""
Write-Host "Para que produccion reciba orientacion tambien, subi/redeploya Backend." -ForegroundColor Yellow
