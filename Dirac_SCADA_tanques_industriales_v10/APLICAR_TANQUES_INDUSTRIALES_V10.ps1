$ErrorActionPreference = "Stop"

$repo = Get-Location

$backend = Join-Path $repo "Backend\app\routes\infraestructura\layout.py"
$types = Join-Path $repo "FrontEnd\App_2\src\features\infra-diagram\types.ts"
$infra = Join-Path $repo "FrontEnd\App_2\src\features\infra-diagram\InfraDiagram.tsx"
$tankView = Join-Path $repo "FrontEnd\App_2\src\features\infra-diagram\components\nodes\TankNodeView.tsx"
$edge = Join-Path $repo "FrontEnd\App_2\src\features\infra-diagram\components\edges\EditableEdge.tsx"

foreach ($f in @($backend,$types,$infra,$tankView,$edge)) {
    if (!(Test-Path $f)) {
        throw "No encuentro $f. Ejecuta este script desde la raiz de DiracInstrumentacion."
    }
}

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
Copy-Item (Join-Path $here "reemplazos\TankNodeView.tsx") $tankView -Force

Write-Host "1/4 Backend: enviando tanks.categoria..." -ForegroundColor Cyan
$b = Get-Content $backend -Raw

# SIN company_id: agregar join tanks + categoria
if ($b -notmatch "t\.categoria.*AS categoria") {
    $b = $b.Replace(
        "c.name, c.in_maintenance,",
        "c.name, c.in_maintenance,`r`n                      CASE WHEN c.type = 'tank' THEN t.categoria ELSE NULL END AS categoria,"
    )

    $b = $b.Replace(
        "LEFT JOIN public.layout_valves lv ON lv.node_id = c.node_id",
        "LEFT JOIN public.layout_valves lv ON lv.node_id = c.node_id`r`n                    LEFT JOIN public.tanks t ON c.type = 'tank' AND t.id = c.id"
    )
}

# CON company_id: tanque lleva categoria; demás NULL
$b = $b.Replace(
    "                    t.name::text AS name,`r`n                    FALSE AS in_maintenance,",
    "                    t.name::text AS name,`r`n                    FALSE AS in_maintenance,`r`n                    t.categoria::text AS categoria,"
)
$b = $b.Replace(
    "                    t.name::text AS name,`n                    FALSE AS in_maintenance,",
    "                    t.name::text AS name,`n                    FALSE AS in_maintenance,`n                    t.categoria::text AS categoria,"
)

# Agregar NULL categoria a CTEs no-tank si falta.
foreach ($marker in @("'pump'::text AS type","'valve'::text AS type","'manifold'::text AS type","'network_analyzer'::text AS type")) {
    $idx = $b.IndexOf($marker)
    if ($idx -ge 0) {
        $loc = $b.IndexOf("l.id::bigint AS location_id", $idx)
        if ($loc -ge 0) {
            $start = [Math]::Max($idx, $loc - 500)
            $chunk = $b.Substring($start, $loc - $start)
            if ($chunk -notmatch "categoria") {
                $b = $b.Insert($loc, "NULL::text AS categoria,`r`n                    ")
            }
        }
    }
}

# Final union fields
$b = $b.Replace(
"SELECT node_id,id,type,x,y,updated_at,online,state,level_pct,alarma,name,in_maintenance,orientacion,location_id,location_name,meta,signals FROM t",
"SELECT node_id,id,type,x,y,updated_at,online,state,level_pct,alarma,name,in_maintenance,categoria,orientacion,location_id,location_name,meta,signals FROM t"
)
$b = $b.Replace(
"SELECT node_id,id,type,x,y,updated_at,online,state,level_pct,alarma,name,in_maintenance,orientacion,location_id,location_name,meta,signals FROM p",
"SELECT node_id,id,type,x,y,updated_at,online,state,level_pct,alarma,name,in_maintenance,categoria,orientacion,location_id,location_name,meta,signals FROM p"
)
$b = $b.Replace(
"SELECT node_id,id,type,x,y,updated_at,online,state,level_pct,alarma,name,in_maintenance,orientacion,location_id,location_name,meta,signals FROM v",
"SELECT node_id,id,type,x,y,updated_at,online,state,level_pct,alarma,name,in_maintenance,categoria,orientacion,location_id,location_name,meta,signals FROM v"
)
$b = $b.Replace(
"SELECT node_id,id,type,x,y,updated_at,online,state,level_pct,alarma,name,in_maintenance,orientacion,location_id,location_name,meta,signals FROM m",
"SELECT node_id,id,type,x,y,updated_at,online,state,level_pct,alarma,name,in_maintenance,categoria,orientacion,location_id,location_name,meta,signals FROM m"
)
$b = $b.Replace(
"SELECT node_id,id,type,x,y,updated_at,online,state,level_pct,alarma,name,in_maintenance,orientacion,location_id,location_name,meta,signals FROM na",
"SELECT node_id,id,type,x,y,updated_at,online,state,level_pct,alarma,name,in_maintenance,categoria,orientacion,location_id,location_name,meta,signals FROM na"
)

Set-Content $backend $b -Encoding UTF8

Write-Host "2/4 Tipos: categoria + puertos en los cuatro lados..." -ForegroundColor Cyan
$t = Get-Content $types -Raw

if ($t -notmatch '\| "L3"') {
    $t = $t.Replace(
'  | "L2"',
'  | "L2"`r`n  | "L3"'
    )
}
if ($t -notmatch '\| "T2"') {
    $t = $t.Replace(
'  | "T1"',
'  | "T1"`r`n  | "T2"`r`n  | "T3"'
    )
}
if ($t -notmatch '\| "B2"') {
    $t = $t.Replace(
'  | "B1";',
'  | "B1"`r`n  | "B2"`r`n  | "B3";'
    )
}

if ($t -notmatch 'categoria\?: "tanque" \| "pozo"') {
    $t = $t.Replace(
        "  alarma?: string | null;",
        "  alarma?: string | null;`r`n  categoria?: `"tanque`" | `"pozo`" | null;"
    )
}

# Reemplazar TANK_PORTS
$oldTankPorts = @"
export const TANK_PORTS: NodePorts = {
  in: ["L1"],
  out: ["R1", "R2", "R3"],
};
"@

$newTankPorts = @"
export const TANK_PORTS: NodePorts = {
  // Entradas disponibles: izquierda y parte superior
  in: ["L1", "L2", "L3", "T1", "T2", "T3"],

  // Salidas disponibles: derecha y parte inferior
  out: ["R1", "R2", "R3", "B1", "B2", "B3"],
};
"@

if ($t.Contains($oldTankPorts)) {
    $t = $t.Replace($oldTankPorts, $newTankPorts)
}

Set-Content $types $t -Encoding UTF8

Write-Host "3/4 InfraDiagram: categoria + puntos alrededor del tanque..." -ForegroundColor Cyan
$i = Get-Content $infra -Raw

if ($i -notmatch 'categoria: \(n as any\)\.categoria') {
    $i = $i.Replace(
        "      alarma: n.alarma ?? null,",
        "      alarma: n.alarma ?? null,`r`n      categoria: (n as any).categoria ?? null,"
    )
}

# Reemplazar buildPorts completo con versión especial para tanks.
$start = $i.IndexOf("function buildPorts(n: UINode) {")
$endMarker = "/** =========================`r`n *  FLOW SIM"
$end = $i.IndexOf($endMarker, $start)

if ($start -ge 0 -and $end -gt $start) {
    $newBuild = @"
function buildPorts(n: UINode) {
  const { ins, outs } = getNodePorts(n);

  if (n.type === "tank") {
    const halfW = 150;
    const halfH = 110;

    const pos: Record<string, { x: number; y: number }> = {
      L1: { x: n.x - halfW, y: n.y - 45 },
      L2: { x: n.x - halfW, y: n.y },
      L3: { x: n.x - halfW, y: n.y + 45 },

      R1: { x: n.x + halfW, y: n.y - 45 },
      R2: { x: n.x + halfW, y: n.y },
      R3: { x: n.x + halfW, y: n.y + 45 },

      T1: { x: n.x - 70, y: n.y - halfH },
      T2: { x: n.x, y: n.y - halfH },
      T3: { x: n.x + 70, y: n.y - halfH },

      B1: { x: n.x - 70, y: n.y + halfH },
      B2: { x: n.x, y: n.y + halfH },
      B3: { x: n.x + 70, y: n.y + halfH },
    };

    return {
      inPorts: ins.map((id) => ({
        portId: id,
        side: "in" as const,
        ...(pos[id] ?? { x: n.x - halfW, y: n.y }),
      })),
      outPorts: outs.map((id) => ({
        portId: id,
        side: "out" as const,
        ...(pos[id] ?? { x: n.x + halfW, y: n.y }),
      })),
    };
  }

  const off = 6;
  const half = halfByType(n.type);
  const h = heightByType(n.type);
  const span = Math.max(18, h * 0.6);

  const inOffs = spreadOffsets(ins.length, span);
  const outOffs = spreadOffsets(outs.length, span);

  const inPorts = ins.map((id, idx) => ({
    portId: id,
    side: "in" as const,
    x: n.x - half - off,
    y: n.y + inOffs[idx],
  }));

  const outPorts = outs.map((id, idx) => ({
    portId: id,
    side: "out" as const,
    x: n.x + half + off,
    y: n.y + outOffs[idx],
  }));

  return { inPorts, outPorts };
}

"@

    $i = $i.Substring(0, $start) + $newBuild + $i.Substring($end)
}

Set-Content $infra $i -Encoding UTF8

Write-Host "4/4 EditableEdge: puertos reales en todos los lados..." -ForegroundColor Cyan
$e = Get-Content $edge -Raw

$start2 = $e.IndexOf('  if ((n as any).type === "tank") {')
$end2 = $e.IndexOf('  if ((n as any).type === "pump") {', $start2)

if ($start2 -ge 0 -and $end2 -gt $start2) {
$tankPortBlock = @"
  if ((n as any).type === "tank") {
    const W = 300;
    const H = 220;

    const leftX = (n as any).x - W / 2;
    const rightX = (n as any).x + W / 2;
    const topY = (n as any).y - H / 2;
    const bottomY = (n as any).y + H / 2;

    switch (pid) {
      case "L1": return { x: leftX, y: (n as any).y - 45 };
      case "L2": return { x: leftX, y: (n as any).y };
      case "L3": return { x: leftX, y: (n as any).y + 45 };

      case "R1": return { x: rightX, y: (n as any).y - 45 };
      case "R2": return { x: rightX, y: (n as any).y };
      case "R3": return { x: rightX, y: (n as any).y + 45 };

      case "T1": return { x: (n as any).x - 70, y: topY };
      case "T2": return { x: (n as any).x, y: topY };
      case "T3": return { x: (n as any).x + 70, y: topY };

      case "B1": return { x: (n as any).x - 70, y: bottomY };
      case "B2": return { x: (n as any).x, y: bottomY };
      case "B3": return { x: (n as any).x + 70, y: bottomY };

      default:
        return getDefaultPort(n, side);
    }
  }

"@
    $e = $e.Substring(0, $start2) + $tankPortBlock + $e.Substring($end2)
}

Set-Content $edge $e -Encoding UTF8

Write-Host ""
Write-Host "LISTO." -ForegroundColor Green
Write-Host "- Tanques y pozos se distinguen por Supabase." -ForegroundColor Green
Write-Host "- Los puntos de conexion del tanque NO se ven en modo normal." -ForegroundColor Green
Write-Host "- Al activar Editar + Conectar aparecen puntos en los cuatro lados." -ForegroundColor Green
Write-Host "- Las conexiones existentes salen directamente desde el borde del equipo." -ForegroundColor Green
Write-Host ""
Write-Host "Probar:"
Write-Host "  cd FrontEnd\App_2"
Write-Host "  npm run dev"
Write-Host ""
Write-Host "Para producción también tenés que redeployar Backend." -ForegroundColor Yellow
