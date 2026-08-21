$ErrorActionPreference = "Stop"

$src = ".\Dirac_App1_impulsion_real_v18_8\reemplazos\FrontEnd\App_1\src\components\red\WaterNetworkOverviewLive.tsx"
$dst = ".\FrontEnd\App_1\src\components\red\WaterNetworkOverviewLive.tsx"
$widget = ".\FrontEnd\App_1\src\widget\index.tsx"

foreach ($f in @($src, $widget)) {
    if (!(Test-Path $f)) {
        throw "No encuentro $f. Ejecutá desde la raíz de DiracInstrumentacion."
    }
}

New-Item -ItemType Directory -Force -Path (Split-Path $dst) | Out-Null
Copy-Item $src $dst -Force

$txt = Get-Content $widget -Raw

# Cambiar import Demo -> Live
$oldImport = 'import WaterNetworkOverviewDemo from "@/components/red/WaterNetworkOverview.demo";'
$newImport = 'import WaterNetworkOverviewLive from "@/components/red/WaterNetworkOverviewLive";'

if ($txt.Contains($oldImport)) {
    $txt = $txt.Replace($oldImport, $newImport)
} elseif (!$txt.Contains($newImport)) {
    $anchor = 'import TankLevelChart from "@/components/TankLevelChart";'
    if (!$txt.Contains($anchor)) {
        throw "No encontré import TankLevelChart."
    }
    $txt = $txt.Replace($anchor, $anchor + [Environment]::NewLine + $newImport)
}

# Cambiar componente Demo -> Live
$txt = $txt.Replace('<WaterNetworkOverviewDemo />', '<WaterNetworkOverviewLive />')

Set-Content $widget $txt -Encoding UTF8

Write-Host ""
Write-Host "V18.8 aplicado correctamente." -ForegroundColor Green
Write-Host "Impulsión ya no usa datos demo." -ForegroundColor Green
Write-Host "Ahora toma las 12 bombas reales marcadas en Supabase." -ForegroundColor Green
Write-Host ""
Write-Host "Probá:" -ForegroundColor Yellow
Write-Host "cd FrontEnd\App_1"
Write-Host "npm run dev"
