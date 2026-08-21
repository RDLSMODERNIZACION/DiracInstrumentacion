DIRAC - FIX corrected_corrected V18.28

Los logs de Render muestran el error real:

psycopg.errors.UndefinedTable:
relation "kpi.v_pump_operation_1d_corrected_corrected" does not exist

La vista que sí existe en Supabase es:
kpi.v_pump_operation_1d_corrected

Causa:
Un parche anterior volvió a reemplazar:
kpi.v_pump_operation_1d
dentro de:
kpi.v_pump_operation_1d_corrected

y terminó formando:
kpi.v_pump_operation_1d_corrected_corrected

V18.28:
- reemplaza corrected_corrected por corrected
- agrega protección para no dejar duplicaciones
- no cambia ninguna otra lógica

Aplicar:
powershell -ExecutionPolicy Bypass -File .\Dirac_fix_corrected_corrected_v18_28\APLICAR_FIX_CORRECTED_CORRECTED_V18_28.ps1

Después:
git add Backend/app/routes/kpi/operation_reliability.py
git commit -m "fix duplicated corrected reliability view"
git push

Esperar redeploy de Render.
