$ErrorActionPreference="Stop"
if (!(Test-Path ".\vercel.json")) {
  throw "Ejecutá este script desde FrontEnd/App_Principal."
}
python ".\tools\aplicar_rewrite_admin_estable.py"
Write-Host ""
Write-Host "Rewrite actualizado al dominio estable del admin." -ForegroundColor Green
