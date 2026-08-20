DIRAC SCADA - FIX PUMP SELECT V13.9

Diagnóstico:
- PUMP_POINTER_SELECT aparece.
- PUMP_SELECT no aparece.
- pumpTapFrom sigue null.

Eso indica que el evento llega a PumpNodeView pero no cruza correctamente hacia InfraDiagram.

Este fix evita props/callbacks intermedios:
PumpNodeView
 -> window.dispatchEvent("dirac:pump-tap-select")
 -> InfraDiagram escucha el evento
 -> setPumpTapFrom(nodeId)

Esperado:
[PUMP-TAP][PUMP_POINTER_SELECT]
[PUMP-TAP][PUMP_SELECT_EVENT]
[PUMP-TAP][STATE] pumpTapFrom="pump:XX"

Aplicar:
.\Dirac_SCADA_pump_select_fix_v13_9\APLICAR_FIX_PUMP_SELECT_V13_9.ps1

Después:
cd FrontEnd\App_2
npm run dev
