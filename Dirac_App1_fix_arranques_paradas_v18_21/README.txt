DIRAC APP 1 - FIX ARRANQUES/PARADAS V18.21

SUPABASE
La vista corregida ya existe:
kpi.v_pump_operation_1d_corrected

LÓGICA
Se cuentan solamente transiciones reales:
- STOP -> RUN = ARRANQUE
- RUN -> STOP = PARADA
- el estado inicial arrastrado de un día anterior NO genera un evento nuevo

Ejemplo:
Una bomba queda OFF desde el lunes al viernes.
Antes podía sumar una parada cada día.
Ahora suma una sola parada: la transición real del lunes.

Valores de control de agosto 2026:
- PP BOMBA 7: 4 arranques / 3 paradas
- PP BOMBA 2: 10 / 10
- PP Bomba 4: 2 / 2
- PE BOMBA 2: 0 / 0
- PE BOMBA 3: 37 / 37
- Bomba 1 PE: 0 / 0

ESTE ZIP
Hace que operation_reliability.py use:
kpi.v_pump_operation_1d_corrected

en:
- pump-daily
- pump-daily-chart
- pump-ranking

APLICAR
powershell -ExecutionPolicy Bypass -File .\Dirac_App1_fix_arranques_paradas_v18_21\APLICAR_FIX_ARRANQUES_PARADAS_V18_21.ps1

DESPUÉS
git add Backend/app/routes/kpi/operation_reliability.py
git commit -m "fix real pump start stop transitions"
git push
