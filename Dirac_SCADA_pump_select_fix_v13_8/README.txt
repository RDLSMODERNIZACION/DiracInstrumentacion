DIRAC SCADA - FIX PUMP SELECT V13.8

Diagnóstico:
PUMP_POINTER_SELECT sí aparece, pero PUMP_SELECT no.
Eso demuestra que PumpNodeView recibe el pointerdown pero su onClick anterior
no estaba cambiando pumpTapFrom.

Este fix elimina esa dependencia:

PumpNodeView
   -> onTapSelect(nodeId)
   -> handlePumpTapSelect(nodeId) en InfraDiagram
   -> setPumpTapFrom(nodeId)

Esperado:
[PUMP-TAP][PUMP_POINTER_SELECT]
[PUMP-TAP][PUMP_SELECT]
[PUMP-TAP][STATE] pumpTapFrom="pump:XX"

Aplicar:
.\Dirac_SCADA_pump_select_fix_v13_8\APLICAR_FIX_PUMP_SELECT_V13_8.ps1

Después:
cd FrontEnd\App_2
npm run dev
