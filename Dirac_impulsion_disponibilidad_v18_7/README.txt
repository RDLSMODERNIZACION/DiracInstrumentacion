DIRAC - IMPULSIÓN / DISPONIBILIDAD V18.7

SUPABASE
Ya fue modificado directamente:
- pumps.rol_red
- pumps.disponible
- pumps.disponibilidad_actualizada_at

12 bombas marcadas como impulsion_principal:
12 PP BOMBA 7
13 PP BOMBA 6
14 PP BOMBA 2
15 PP Bomba 4
16 PP BOMBA 5
17 PP BOMBA 1
18 PP Bomba 3
24 PE BOMBA 2
25 PE BOMBA 3
26 PE BOMBA 1
29 Bomba 2 PE
30 Bomba 1 PE

Todas quedaron inicialmente Disponible = true.

ZIP
Agrega:
- Backend/app/routes/infraestructura/pump_availability.py
- FrontEnd/App_2/src/features/infra-diagram/services/pumpAvailability.ts

Modifica:
- Backend/app/routes/infraestructura/__init__.py
- FrontEnd/App_2/src/features/infra-diagram/InfraDiagram.tsx

USO
En App_2:
Editar -> seleccionar bomba principal -> botón Disponible / No disponible.

El botón no aparece en bombas secundarias.

APLICAR
powershell -ExecutionPolicy Bypass -File .\Dirac_impulsion_disponibilidad_v18_7\APLICAR_IMPULSION_DISPONIBILIDAD_V18_7.ps1

Luego probar frontend:
cd FrontEnd\App_2
npm run dev

Para producción:
git add .
git commit -m "add pump network availability"
git push

Render debe redeployar el backend para que el botón pueda guardar.
