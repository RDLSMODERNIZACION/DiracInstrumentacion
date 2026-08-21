$ErrorActionPreference = "Stop"

$repo = Get-Location
$infra = Join-Path $repo "FrontEnd\App_2\src\features\infra-diagram\InfraDiagram.tsx"

if (!(Test-Path $infra)) {
    throw "No encuentro InfraDiagram.tsx. Ejecutá desde la raíz de DiracInstrumentacion."
}

$txt = Get-Content $infra -Raw

Write-Host "Aplicando V14.8 - conexiones internas en tanques..." -ForegroundColor Cyan

# Buscamos el bloque del TANQUE NORMAL dentro de buildPorts.
$startToken = '    // TANQUE NORMAL'
$endToken   = '  const off = 6;'

$start = $txt.IndexOf($startToken)
if ($start -lt 0) {
    throw 'No encontré el bloque "// TANQUE NORMAL" en InfraDiagram.tsx'
}

$end = $txt.IndexOf($endToken, $start)
if ($end -lt 0) {
    throw 'No encontré el final del bloque buildPorts: const off = 6;'
}

$newBlock = @'
    // TANQUE NORMAL
    //
    // Cuerpo visual:
    //   ancho aprox. 256 px
    //   alto aprox. 144 px
    //
    // Los puntos quedan metidos dentro del cuerpo para que la
    // cañería parezca nacer desde el tanque y no desde afuera.
    const insideX = 118;
    const insideY = 82;

    const pos: Record<string, { x: number; y: number }> = {
      // Laterales: 3 puntos por lado, todos dentro del cuerpo
      L1: { x: n.x - insideX, y: n.y - 42 },
      L2: { x: n.x - insideX, y: n.y },
      L3: { x: n.x - insideX, y: n.y + 42 },

      R1: { x: n.x + insideX, y: n.y - 42 },
      R2: { x: n.x + insideX, y: n.y },
      R3: { x: n.x + insideX, y: n.y + 42 },

      // Superior e inferior también levemente adentro
      T1: { x: n.x - 65, y: n.y - insideY },
      T2: { x: n.x,      y: n.y - insideY },
      T3: { x: n.x + 65, y: n.y - insideY },

      B1: { x: n.x - 65, y: n.y + insideY },
      B2: { x: n.x,      y: n.y + insideY },
      B3: { x: n.x + 65, y: n.y + insideY },
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

'@

$before = $txt.Substring(0, $start)
$after  = $txt.Substring($end)

$txt = $before + $newBlock + $after

Set-Content $infra $txt -Encoding UTF8

Write-Host ""
Write-Host "V14.8 aplicado correctamente." -ForegroundColor Green
Write-Host "Los puntos de conexión de tanques ahora quedan dentro del cuerpo." -ForegroundColor Green
Write-Host "Pozo y bombas no se modifican." -ForegroundColor Yellow
