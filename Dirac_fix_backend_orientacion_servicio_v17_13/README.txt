DIRAC - FIX BACKEND PRODUCCION V17.13

Error:
column "orientacion" does not exist

Causa:
La consulta final pide:
categoria, orientacion, servicio, ...

pero la CTE p (bombas) sólo devolvía categoria y luego location_id.

Fix:
agrega:
p.orientacion::text AS orientacion,
p.servicio::text AS servicio,

Aplicar desde la raíz:
.\Dirac_fix_backend_orientacion_servicio_v17_13\APLICAR_FIX_BACKEND_ORIENTACION_V17_13.ps1

Luego:
git add Backend/app/routes/infraestructura/layout.py
git commit -m "fix pump orientacion servicio layout"
git push
