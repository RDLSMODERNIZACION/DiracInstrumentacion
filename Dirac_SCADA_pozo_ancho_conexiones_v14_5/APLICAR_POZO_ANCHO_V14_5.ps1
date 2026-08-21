$ErrorActionPreference = "Stop"

$repo = Get-Location
$tank = Join-Path $repo "FrontEnd\App_2\src\features\infra-diagram\components\nodes\TankNodeView.tsx"
$infra = Join-Path $repo "FrontEnd\App_2\src\features\infra-diagram\InfraDiagram.tsx"

foreach ($f in @($tank,$infra)) {
    if (!(Test-Path $f)) {
        throw "No encuentro $f. Ejecutá desde la raíz de DiracInstrumentacion."
    }
}

Write-Host "Aplicando pozo más ancho + conexiones internas..." -ForegroundColor Cyan

# =========================================================
# 1) TankNodeView.tsx
# =========================================================
$t = Get-Content $tank -Raw

$t = $t.Replace(
'    const W = 280;
    const H = 330;

    const shaftX = 70;
    const shaftY = 62;
    const shaftW = 140;
    const shaftH = 225;',
'    const W = 420;
    const H = 330;

    const shaftX = 60;
    const shaftY = 62;
    const shaftW = 300;
    const shaftH = 225;'
)

$t = $t.Replace(
'          rx={74}',
'          rx={154}'
)

$t = $t.Replace(
'          rx={68}',
'          rx={148}'
)

$t = $t.Replace(
'          cx={88}',
'          cx={82}'
)

$t = $t.Replace(
'            cx={W - 88}',
'            cx={W - 82}'
)

Set-Content $tank $t -Encoding UTF8

# =========================================================
# 2) InfraDiagram.tsx - buildPorts pozo
# =========================================================
$i = Get-Content $infra -Raw

$old = @'
  if (n.type === "tank") {
    const isWell = (n as any).categoria === "pozo";
    const halfW = isWell ? 140 : 150;
    const halfH = isWell ? 165 : 110;

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
'@

$new = @'
  if (n.type === "tank") {
    const isWell = (n as any).categoria === "pozo";

    if (isWell) {
      // Pozo ancho: puntos de conexión metidos dentro del cuerpo visual.
      // Dos posiciones útiles por lado para permitir dos bombas a izquierda
      // y dos bombas a derecha sin que parezca que la cañería nace afuera.
      const insideX = 140;

      const pos: Record<string, { x: number; y: number }> = {
        L1: { x: n.x - insideX, y: n.y - 52 },
        L2: { x: n.x - insideX, y: n.y + 52 },
        L3: { x: n.x - insideX, y: n.y },

        R1: { x: n.x + insideX, y: n.y - 52 },
        R2: { x: n.x + insideX, y: n.y + 52 },
        R3: { x: n.x + insideX, y: n.y },

        T1: { x: n.x - 75, y: n.y - 105 },
        T2: { x: n.x,      y: n.y - 105 },
        T3: { x: n.x + 75, y: n.y - 105 },

        B1: { x: n.x - 75, y: n.y + 105 },
        B2: { x: n.x,      y: n.y + 105 },
        B3: { x: n.x + 75, y: n.y + 105 },
      };

      return {
        inPorts: ins.map((id) => ({
          portId: id,
          side: "in" as const,
          ...(pos[id] ?? { x: n.x - insideX, y: n.y }),
        })),
        outPorts: outs.map((id) => ({
          portId: id,
          side: "out" as const,
          ...(pos[id] ?? { x: n.x + insideX, y: n.y }),
        })),
      };
    }

    // Tanque normal
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
'@

if ($i.Contains($old)) {
    $i = $i.Replace($old, $new)
} else {
    throw "No encontré el bloque buildPorts esperado en InfraDiagram.tsx"
}

Set-Content $infra $i -Encoding UTF8

Write-Host ""
Write-Host "LISTO." -ForegroundColor Green
Write-Host "El pozo ahora es más ancho y los puntos de conexión quedan dentro del cuerpo." -ForegroundColor Green
Write-Host "Tiene espacio visual para dos bombas por lado." -ForegroundColor Yellow
