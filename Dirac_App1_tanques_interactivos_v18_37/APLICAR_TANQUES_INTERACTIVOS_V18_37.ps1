$ErrorActionPreference = "Stop"

$overviewPath = ".\FrontEnd\App_1\src\components\red\WaterNetworkOverviewLive.tsx"
$widgetPath = ".\FrontEnd\App_1\src\widget\index.tsx"

foreach ($f in @($overviewPath, $widgetPath)) {
    if (!(Test-Path $f)) {
        throw "No encuentro $f. Ejecutá desde la raíz de DiracInstrumentacion."
    }
}

Write-Host "Aplicando V18.37 - tanques interactivos - fix PowerShell..." -ForegroundColor Cyan

# ============================================================
# 1) WaterNetworkOverviewLive
# ============================================================
$txt = Get-Content $overviewPath -Raw

# ---- Agregar callback al tipo Props
if ($txt -notmatch 'onSelectTankIds\?') {
    $rxProps = New-Object System.Text.RegularExpressions.Regex(
        '(type Props = \{.*?locationLabel\?: string;)',
        [System.Text.RegularExpressions.RegexOptions]::Singleline
    )
    $txt = $rxProps.Replace(
        $txt,
        '$1' + [Environment]::NewLine + '  onSelectTankIds?: (ids: number[] | "all") => void;',
        1
    )
}

# ---- Agregar callback al destructuring
if ($txt -notmatch 'onSelectTankIds,') {
    $rxDestructure = New-Object System.Text.RegularExpressions.Regex(
        '(locationLabel\s*=\s*"Todas las localidades",)'
    )
    $txt = $rxDestructure.Replace(
        $txt,
        '$1' + [Environment]::NewLine + '  onSelectTankIds,',
        1
    )
}

# ---- Hacer clickeable el título "Tanques de distribución" para volver al conjunto total
$oldTitle = @'
            <div className="text-sm font-bold text-slate-800">
              Tanques de distribución
            </div>
'@

$newTitle = @'
            <button
              type="button"
              onClick={() => onSelectTankIds?.("all")}
              className="text-left text-sm font-bold text-slate-800 transition hover:text-blue-700"
              title="Ver todos los tanques principales"
            >
              Tanques de distribución
            </button>
'@

if ($txt.Contains($oldTitle)) {
    $txt = $txt.Replace($oldTitle, $newTitle)
}

# ---- Hacer clickeable cada encabezado de grupo/localidad
$oldGroupHeader = @'
                <div className="bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700">
                  {group.location}
                </div>
'@

$newGroupHeader = @'
                <button
                  type="button"
                  onClick={() =>
                    onSelectTankIds?.(
                      group.rows
                        .map((r) => Number(r.id))
                        .filter((id) => Number.isFinite(id))
                    )
                  }
                  className="flex w-full items-center justify-between bg-slate-50 px-3 py-2 text-left text-xs font-bold text-slate-700 transition hover:bg-blue-50 hover:text-blue-700"
                  title={`Ver solo los tanques de ${group.location}`}
                >
                  <span>{group.location}</span>
                  <span className="text-[10px] font-medium text-slate-400">
                    Ver conjunto
                  </span>
                </button>
'@

# Reemplazar SOLO el header dentro del bloque de tankGroups.
$tankGroupsPos = $txt.IndexOf('{tankGroups.map')
if ($tankGroupsPos -ge 0) {
    $headerPos = $txt.IndexOf($oldGroupHeader, $tankGroupsPos)
    if ($headerPos -ge 0) {
        $txt = $txt.Substring(0, $headerPos) + $newGroupHeader + $txt.Substring($headerPos + $oldGroupHeader.Length)
    }
}

# ---- Hacer clickeable cada tanque individual
$oldTankRow = @'
                    <div
                      key={r.id}
                      className="grid grid-cols-[minmax(0,1fr)_85px] items-center gap-3 px-3 py-2 text-xs"
                    >
                      <div className="font-medium text-slate-800">{r.name}</div>
                      <div className="text-right font-bold text-slate-900">
                        {r.level == null ? "—" : `${r.level.toFixed(1)}%`}
                      </div>
                    </div>
'@

$newTankRow = @'
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => onSelectTankIds?.([Number(r.id)])}
                      className="grid w-full grid-cols-[minmax(0,1fr)_85px] items-center gap-3 px-3 py-2 text-left text-xs transition hover:bg-blue-50"
                      title={`Ver historial de ${r.name}`}
                    >
                      <div className="font-medium text-slate-800">{r.name}</div>
                      <div className="text-right font-bold text-slate-900">
                        {r.level == null ? "—" : `${r.level.toFixed(1)}%`}
                      </div>
                    </button>
'@

if ($txt.Contains($oldTankRow)) {
    $txt = $txt.Replace($oldTankRow, $newTankRow)
} else {
    Write-Host "Aviso: no encontré el bloque exacto de fila de tanque; intento regex..." -ForegroundColor Yellow

    $pattern = '(?s)<div\s+key=\{r\.id\}\s+className="grid grid-cols-\[minmax\(0,1fr\)_85px\][^"]*">.*?\{r\.name\}.*?\{r\.level == null \? "—" : `\$\{r\.level\.toFixed\(1\)\}%`\}.*?</div>\s*</div>'
    $replacement = @'
<button
                      key={r.id}
                      type="button"
                      onClick={() => onSelectTankIds?.([Number(r.id)])}
                      className="grid w-full grid-cols-[minmax(0,1fr)_85px] items-center gap-3 px-3 py-2 text-left text-xs transition hover:bg-blue-50"
                      title={`Ver historial de ${r.name}`}
                    >
                      <div className="font-medium text-slate-800">{r.name}</div>
                      <div className="text-right font-bold text-slate-900">
                        {r.level == null ? "—" : `${r.level.toFixed(1)}%`}
                      </div>
                    </button>
'@
    $rxTankRow = New-Object System.Text.RegularExpressions.Regex($pattern, [System.Text.RegularExpressions.RegexOptions]::Singleline)
    $txt = $rxTankRow.Replace($txt, $replacement, 1)
}

Set-Content $overviewPath $txt -Encoding UTF8

# ============================================================
# 2) index.tsx
# ============================================================
$widget = Get-Content $widgetPath -Raw

# ---- Permitir que selección manual de tanques tenga prioridad sobre los roles principales.
#      all = todos los principales
#      array = selección específica hecha con click
$operationTankPattern = '(?s)const\s+operationTankIds\s*=\s*tab\s*===\s*"operacion".*?;'

$newOperationTank = @'
const operationTankIds =
    tab === "operacion"
      ? selectedTankIds !== "all"
        ? selectedTankIds
        : principalTankIds.length > 0
          ? principalTankIds
          : selectedTankIds
      : selectedTankIds;
'@

if ([regex]::IsMatch($widget, $operationTankPattern)) {
    $rxOperationTank = New-Object System.Text.RegularExpressions.Regex($operationTankPattern, [System.Text.RegularExpressions.RegexOptions]::Singleline)
    $widget = $rxOperationTank.Replace($widget, $newOperationTank, 1)
} else {
    Write-Host "Aviso: no encontré operationTankIds dinámico. Se usará selectedTankIds directo." -ForegroundColor Yellow
}

# ---- Pasar callback a WaterNetworkOverviewLive
if ($widget -notmatch 'onSelectTankIds=\{setSelectedTankIds\}') {
    $pattern = '(?s)(<WaterNetworkOverviewLive\b.*?)(/>)'
    $m = [regex]::Match($widget, $pattern)

    if (!$m.Success) {
        throw "No encontré WaterNetworkOverviewLive en index.tsx."
    }

    $block = $m.Value

    # Insertarlo antes de />
    $newBlock = $block -replace '/>$',
        ('          onSelectTankIds={setSelectedTankIds}' + [Environment]::NewLine + '        />')

    $widget = $widget.Substring(0, $m.Index) + $newBlock + $widget.Substring($m.Index + $m.Length)
}

Set-Content $widgetPath $widget -Encoding UTF8

Write-Host ""
Write-Host "V18.37 aplicado correctamente." -ForegroundColor Green
Write-Host ""
Write-Host "Ahora podés:" -ForegroundColor Cyan
Write-Host "- Tocar 'Tanques de distribución' -> vuelve a todos los principales"
Write-Host "- Tocar una localidad -> gráfico solo de ese conjunto"
Write-Host "- Tocar un tanque -> gráfico individual"
Write-Host ""
Write-Host "Probá:" -ForegroundColor Yellow
Write-Host "cd FrontEnd\App_1"
Write-Host "npm run dev"
