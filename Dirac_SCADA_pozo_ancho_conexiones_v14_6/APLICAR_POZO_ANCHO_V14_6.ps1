$ErrorActionPreference = "Stop"

$repo = Get-Location
$tank = Join-Path $repo "FrontEnd\App_2\src\features\infra-diagram\components\nodes\TankNodeView.tsx"
$infra = Join-Path $repo "FrontEnd\App_2\src\features\infra-diagram\InfraDiagram.tsx"

foreach ($f in @($tank,$infra)) {
    if (!(Test-Path $f)) {
        throw "No encuentro $f. Ejecutá desde la raíz de DiracInstrumentacion."
    }
}

Write-Host "Aplicando V14.6 - pozo ancho + puertos internos..." -ForegroundColor Cyan

# =========================================================
# 1) TankNodeView.tsx
#    Reemplazos simples, tolerantes a que algunos ya estén hechos.
# =========================================================
$t = Get-Content $tank -Raw

$t = [regex]::Replace($t, 'const W = 280;', 'const W = 420;', 1)
$t = [regex]::Replace($t, 'const shaftX = 70;', 'const shaftX = 60;', 1)
$t = [regex]::Replace($t, 'const shaftW = 140;', 'const shaftW = 300;', 1)

# Si ya estaban cambiados, no pasa nada.
$t = [regex]::Replace($t, 'rx=\{74\}', 'rx={154}', 1)
$t = [regex]::Replace($t, 'rx=\{68\}', 'rx={148}', 1)
$t = [regex]::Replace($t, 'cx=\{88\}', 'cx={82}', 1)
$t = [regex]::Replace($t, 'cx=\{W - 88\}', 'cx={W - 82}', 1)

Set-Content $tank $t -Encoding UTF8

# =========================================================
# 2) InfraDiagram.tsx
#    Reemplazar TODO el bloque tank de buildPorts usando límites
#    estructurales, sin depender del texto exacto anterior.
# =========================================================
$i = Get-Content $infra -Raw

$startToken = '  if (n.type === "tank") {'
$endToken   = '  const off = 6;'

$start = $i.IndexOf($startToken)
if ($start -lt 0) {
    throw 'No encontré: if (n.type === "tank") {'
}

$end = $i.IndexOf($endToken, $start)
if ($end -lt 0) {
    throw 'No encontré el final del bloque buildPorts: const off = 6;'
}

$newBlock = @'
  if (n.type === "tank") {
    const isWell = (n as any).categoria === "pozo";

    if (isWell) {
      /*
       * POZO ANCHO
       * Casing visual aproximado: 300 px.
       *
       * Los puertos laterales quedan ADENTRO del cuerpo:
       * - dos a la izquierda
       * - dos a la derecha
       *
       * Esto permite ubicar hasta dos bombas por lado.
       */
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

    // TANQUE NORMAL
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

$before = $i.Substring(0, $start)
$after  = $i.Substring($end)

$i = $before + $newBlock + $after

Set-Content $infra $i -Encoding UTF8

Write-Host ""
Write-Host "V14.6 aplicado correctamente." -ForegroundColor Green
Write-Host "Pozo más ancho y puertos laterales internos." -ForegroundColor Green
Write-Host "Este parche no depende del bloque exacto anterior." -ForegroundColor Yellow
