FIX REWRITE ADMIN - DOMINIO ESTABLE

Reemplaza la URL temporal de deployment por:
https://dirac-admin.vercel.app

Aplicar desde:
DiracInstrumentacion\FrontEnd\App_Principal

.\APLICAR.ps1

Luego:
git diff
git add .
git commit -m "Usar dominio estable del admin"
git push

Después del deploy, probar:
https://www.diracserviciosenergia.com/admin
