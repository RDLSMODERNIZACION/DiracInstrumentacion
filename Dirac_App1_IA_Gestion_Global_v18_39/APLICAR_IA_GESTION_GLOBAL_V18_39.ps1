$ErrorActionPreference = "Stop"

$backendFile = ".\Backend\app\routes\kpi\ai_operation.py"
$kpiInit = ".\Backend\app\routes\kpi\__init__.py"
$frontComponent = ".\FrontEnd\App_1\src\components\AIManagementPage.tsx"
$widget = ".\FrontEnd\App_1\src\widget\index.tsx"

foreach ($f in @($kpiInit, $widget)) {
    if (!(Test-Path $f)) {
        throw "No encuentro $f. Ejecutá desde la raíz de DiracInstrumentacion."
    }
}

Write-Host "Aplicando V18.39 - IA operacional en Gestión global..." -ForegroundColor Cyan

New-Item -ItemType Directory -Force -Path (Split-Path $backendFile) | Out-Null
New-Item -ItemType Directory -Force -Path (Split-Path $frontComponent) | Out-Null

$backendContent = Get-Content ".\Dirac_App1_IA_Gestion_Global_v18_39\files\ai_operation.py" -Raw
$frontContent = Get-Content ".\Dirac_App1_IA_Gestion_Global_v18_39\files\AIManagementPage.tsx" -Raw

Set-Content $backendFile $backendContent -Encoding UTF8
Set-Content $frontComponent $frontContent -Encoding UTF8

# ============================================================
# Backend router
# ============================================================
$init = Get-Content $kpiInit -Raw

if ($init -notmatch 'ai_operation_router') {
    $importAnchor = 'from .operation_reliability import router as operation_reliability_router'
    if (!$init.Contains($importAnchor)) {
        throw "No encontré el import operation_reliability_router en kpi/__init__.py"
    }

    $init = $init.Replace(
        $importAnchor,
        $importAnchor + [Environment]::NewLine + 'from .ai_operation import router as ai_operation_router'
    )

    $includeAnchor = 'router.include_router(operation_reliability_router)'
    if (!$init.Contains($includeAnchor)) {
        throw "No encontré include_router(operation_reliability_router)"
    }

    $init = $init.Replace(
        $includeAnchor,
        $includeAnchor + [Environment]::NewLine + [Environment]::NewLine + 'router.include_router(ai_operation_router)'
    )

    Set-Content $kpiInit $init -Encoding UTF8
}

# ============================================================
# Front import
# ============================================================
$w = Get-Content $widget -Raw

if ($w -notmatch 'AIManagementPage') {
    $anchor = 'import ProcesoCalidad from "@/components/ProcesoCalidad";'
    if (!$w.Contains($anchor)) {
        throw "No encontré import de ProcesoCalidad en widget/index.tsx"
    }

    $w = $w.Replace(
        $anchor,
        $anchor + [Environment]::NewLine + 'import AIManagementPage from "@/components/AIManagementPage";'
    )
}

# ============================================================
# Reemplazar bloque Gestión global reservado
# ============================================================
$pattern = '(?s)\{tab === "gestion" && \(\s*<section>\s*<Card className="rounded-2xl">.*?Espacio reservado para indicadores globales, seguimiento y\s*administración\..*?</Card>\s*</section>\s*\)\}'

$replacement = @'
{tab === "gestion" && (
        <section>
          <AIManagementPage />
        </section>
      )}
'@

$rx = New-Object System.Text.RegularExpressions.Regex(
    $pattern,
    [System.Text.RegularExpressions.RegexOptions]::Singleline
)

$newW = $rx.Replace($w, $replacement, 1)

if ($newW -eq $w) {
    # fallback estructural entre el marcador gestion y el próximo section Resumen
    $start = $w.IndexOf('{tab === "gestion" && (')
    $next = $w.IndexOf('      <section>' + [Environment]::NewLine + '        <Card className="rounded-2xl">', $start + 1)

    if ($start -lt 0 -or $next -lt 0) {
        throw "No pude localizar de forma segura el bloque Gestión global."
    }

    $newW = $w.Substring(0, $start) + $replacement + [Environment]::NewLine + $w.Substring($next)
}

$w = $newW

# ============================================================
# Ocultar Resumen por ubicación en Gestión global.
# Solo dejamos el resumen en las otras pestañas.
# ============================================================
if ($w -notmatch '\{tab !== "gestion" && \(\s*<section>\s*<Card className="rounded-2xl">\s*<CardHeader className="flex flex-row items-center justify-between pb-2">\s*<CardTitle className="text-base">Resumen por ubicación') {
    $summaryAnchor = @'
      <section>
        <Card className="rounded-2xl">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base">Resumen por ubicación</CardTitle>
'@

    if ($w.Contains($summaryAnchor)) {
        $w = $w.Replace(
            $summaryAnchor,
            @'
      {tab !== "gestion" && (
      <section>
        <Card className="rounded-2xl">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base">Resumen por ubicación</CardTitle>
'@
        )

        $closeAnchor = @'
          </CardContent>
        </Card>
      </section>
    </div>
'@

        $closeReplacement = @'
          </CardContent>
        </Card>
      </section>
      )}
    </div>
'@

        $last = $w.LastIndexOf($closeAnchor)
        if ($last -ge 0) {
            $w = $w.Substring(0, $last) + $closeReplacement + $w.Substring($last + $closeAnchor.Length)
        }
    }
}

Set-Content $widget $w -Encoding UTF8

Write-Host ""
Write-Host "V18.39 aplicado." -ForegroundColor Green
Write-Host ""
Write-Host "Backend:" -ForegroundColor Cyan
Write-Host "  GET  /kpi/ai/context"
Write-Host "  GET  /kpi/ai/latest"
Write-Host "  POST /kpi/ai/analyze"
Write-Host ""
Write-Host "Front:" -ForegroundColor Cyan
Write-Host "  Gestión global -> Inteligencia operacional"
Write-Host ""
Write-Host "IMPORTANTE EN RENDER:" -ForegroundColor Yellow
Write-Host "  OPENAI_API_KEY = tu clave de API"
Write-Host "  OPENAI_MODEL = gpt-5.6-luna   (opcional)"
Write-Host ""
Write-Host "Luego probá build:" -ForegroundColor Yellow
Write-Host "cd FrontEnd\App_1"
Write-Host "npm run build"
