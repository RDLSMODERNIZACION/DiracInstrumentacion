$ErrorActionPreference = "Stop"

$repo = Get-Location
$layout = Join-Path $repo "Backend\app\routes\infraestructura\layout.py"

if (!(Test-Path $layout)) {
    throw "No encuentro $layout. Ejecutá desde la raíz de DiracInstrumentacion."
}

$txt = Get-Content $layout -Raw

Write-Host "Aplicando fix backend network_analyzers V16.1..." -ForegroundColor Cyan

# ============================================================
# 1) SIN company_id:
#    Reemplazar el SELECT basado solo en v_layout_combined
#    por una unión explícita con layout_network_analyzers.
# ============================================================

$oldStart = '# SIN company_id: leemos de la VIEW'
$oldEnd   = '# CON company_id: query rápida'

$start = $txt.IndexOf($oldStart)
$end   = $txt.IndexOf($oldEnd)

if ($start -lt 0 -or $end -lt 0 -or $end -le $start) {
    throw "No encontré los marcadores esperados en layout.py"
}

$newNoCompany = @'
            # SIN company_id:
            # leemos la view general y agregamos explícitamente los analizadores
            # para no depender de que v_layout_combined los incluya.
            if company_id is None:
                cur.execute(
                    """
                    SELECT
                      c.node_id,
                      c.id,
                      c.type,
                      c.x,
                      c.y,
                      c.updated_at,
                      c.online,
                      c.state,
                      c.level_pct,
                      c.alarma,
                      c.name,
                      c.in_maintenance,
                      CASE WHEN c.type = 'tank' THEN t.categoria ELSE NULL END AS categoria,
                      CASE WHEN c.type = 'pump' THEN p.orientacion ELSE NULL END AS orientacion,
                      CASE WHEN c.type = 'valve' THEN lv.meta ELSE NULL END AS meta,
                      c.signals,
                      COALESCE(
                        CASE
                          WHEN c.type = 'tank' THEN t.location_id
                          WHEN c.type = 'pump' THEN p.location_id
                          WHEN c.type = 'valve' THEN v.location_id
                          WHEN c.type = 'manifold' THEN m.location_id
                          ELSE NULL
                        END,
                        NULL
                      )::bigint AS location_id,
                      l.name::text AS location_name

                    FROM public.v_layout_combined c

                    LEFT JOIN public.layout_valves lv
                      ON lv.node_id = c.node_id

                    LEFT JOIN public.tanks t
                      ON c.type = 'tank' AND t.id = c.id

                    LEFT JOIN public.pumps p
                      ON c.type = 'pump' AND p.id = c.id

                    LEFT JOIN public.valves v
                      ON c.type = 'valve' AND v.id = c.id

                    LEFT JOIN public.manifolds m
                      ON c.type = 'manifold' AND m.id = c.id

                    LEFT JOIN public.locations l
                      ON l.id = COALESCE(
                        CASE
                          WHEN c.type = 'tank' THEN t.location_id
                          WHEN c.type = 'pump' THEN p.location_id
                          WHEN c.type = 'valve' THEN v.location_id
                          WHEN c.type = 'manifold' THEN m.location_id
                          ELSE NULL
                        END,
                        NULL
                      )

                    UNION ALL

                    SELECT
                      lna.node_id AS node_id,
                      na.id::bigint AS id,
                      'network_analyzer'::text AS type,
                      lna.x,
                      lna.y,
                      lna.updated_at,
                      NULL::boolean AS online,
                      NULL::text AS state,
                      NULL::numeric AS level_pct,
                      NULL::text AS alarma,
                      na.name::text AS name,
                      FALSE AS in_maintenance,
                      NULL::text AS categoria,
                      NULL::text AS orientacion,
                      lna.meta AS meta,
                      '{}'::jsonb AS signals,
                      na.location_id::bigint AS location_id,
                      loc.name::text AS location_name

                    FROM public.layout_network_analyzers lna
                    JOIN public.network_analyzers na
                      ON na.id = lna.analyzer_id
                    LEFT JOIN public.locations loc
                      ON loc.id = na.location_id

                    ORDER BY type, id
                    """
                )
                return cur.fetchall()

'@

$before = $txt.Substring(0, $start)
$after  = $txt.Substring($end)

$txt = $before + $newNoCompany + $after

# ============================================================
# 2) CON company_id:
#    Reemplazar el CTE "na AS (...)" por una versión simple y
#    robusta que no depende de lna.node_id NOT NULL.
# ============================================================

$naStartToken = '                -- ✅ NUEVO: ABB / Network Analyzers'
$selectToken = '                SELECT node_id,id,type,x,y,updated_at,online,state,level_pct,alarma,name,in_maintenance,categoria,orientacion,location_id,location_name,meta,signals FROM t'

$naStart = $txt.IndexOf($naStartToken)
$selectStart = $txt.IndexOf($selectToken)

if ($naStart -lt 0 -or $selectStart -lt 0 -or $selectStart -le $naStart) {
    throw "No encontré el bloque na AS esperado en layout.py"
}

$newNa = @'
                -- Network Analyzers
                na AS (
                  SELECT
                    COALESCE(lna.node_id, 'network_analyzer:' || na.id) AS node_id,
                    na.id::bigint AS id,
                    'network_analyzer'::text AS type,
                    lna.x,
                    lna.y,
                    lna.updated_at,
                    NULL::boolean AS online,
                    NULL::text AS state,
                    NULL::numeric AS level_pct,
                    NULL::text AS alarma,
                    na.name::text AS name,
                    FALSE AS in_maintenance,
                    NULL::text AS categoria,
                    NULL::text AS orientacion,
                    l.id::bigint AS location_id,
                    l.name::text AS location_name,
                    lna.meta AS meta,
                    '{}'::jsonb AS signals

                  FROM public.network_analyzers na
                  JOIN public.locations l
                    ON l.id = na.location_id
                  JOIN locs lx
                    ON lx.id = l.id
                  LEFT JOIN public.layout_network_analyzers lna
                    ON lna.analyzer_id = na.id
                )

'@

$before = $txt.Substring(0, $naStart)
$after = $txt.Substring($selectStart)

$txt = $before + $newNa + $after

Set-Content $layout $txt -Encoding UTF8

Write-Host ""
Write-Host "V16.1 aplicado correctamente." -ForegroundColor Green
Write-Host "Ahora get_layout_combined devuelve network_analyzer con y sin company_id." -ForegroundColor Green
Write-Host "Reiniciá/redeployá el backend." -ForegroundColor Yellow
