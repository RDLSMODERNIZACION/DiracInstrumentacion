DIRAC - FIX BACKEND V17.14

El V17.13 fallaba porque buscaba un bloque exacto de texto.
V17.14 localiza la CTE `p AS (...)` con regex y agrega los campos faltantes
sin depender del espaciado actual.

Agrega dentro de la CTE de bombas:
    p.orientacion::text AS orientacion,
    p.servicio::text AS servicio,

Aplicar desde la raíz:
.\Dirac_fix_backend_orientacion_v17_14\APLICAR_FIX_BACKEND_V17_14.ps1

Después:
git add Backend/app/routes/infraestructura/layout.py
git commit -m "fix pump orientacion servicio layout"
git push
