param(
  [Parameter(Mandatory=$true)]
  [string]$AdminUrl
)

$ErrorActionPreference="Stop"

python ".\tools\aplicar_rewrite_admin.py" $AdminUrl

Write-Host ""
Write-Host "Rewrite /admin configurado." -ForegroundColor Green
Write-Host "Ahora hace commit/push de la web principal." -ForegroundColor Cyan
