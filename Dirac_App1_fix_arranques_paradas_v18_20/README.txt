DIRAC APP 1 - FIX ARRANQUES / PARADAS V18.20

PROBLEMA ENCONTRADO
La tabla diaria kpi.pump_operation_1d estaba contabilizando como evento
el estado arrastrado al inicio de cada día.

Ejemplo:
si una bomba permanecía apagada todo el día, podía aparecer:
Arranques = 0
Paradas   = 1

Eso inflaba las paradas mes a mes.

CORRECCIÓN EN SUPABASE
Ya fue creada directamente:
kpi.v_pump_operation_1d_corrected

Ahora:
- Arranque = transición real cuyo nuevo estado es RUN
- Parada   = transición real cuyo nuevo estado es STOP
- se toma la fecha local America/Argentina/Buenos_Aires
- una bomba que queda apagada varios días NO suma una parada cada día

Ejemplos reales agosto 2026 después de la corrección:
PP BOMBA 7: 4 arranques / 3 paradas
PP BOMBA 2: 10 / 10
PP Bomba 4: 2 / 2
PE BOMBA 2: 0 / 0
PE BOMBA 3: 37 / 37
Bomba 1 PE: 0 / 0

ESTE ZIP
Modifica Backend/app/routes/kpi/operation_reliability.py
para cambiar:
kpi.v_pump_operation_1d
por:
kpi.v_pump_operation_1d_corrected

Esto afecta:
- pump-daily
- pump-daily-chart
- pump-ranking

Aplicar:
powershell -ExecutionPolicy Bypass -File .\Dirac_App1_fix_arranques_paradas_v18_20\APLICAR_FIX_ARRANQUES_PARADAS_V18_20.ps1

Después:
git add Backend/app/routes/kpi/operation_reliability.py
git commit -m "fix pump start stop counts"
git push

Render debe redeployar el backend.
