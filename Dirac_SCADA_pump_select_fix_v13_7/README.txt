DIRAC SCADA - FIX PUMP SELECT V13.7

Los logs siguen mostrando pumpTapFrom=null.
Eso significa que el onClick de la bomba todavía no se dispara.

Este fix ya no depende de onClick:
- cuando Conectar está activo, InfraDiagram manda enabled=false a la bomba
- PumpNodeView detecta enabled=false
- en PointerDown selecciona la bomba inmediatamente
- evita drag y evita depender del evento click

Esperado:
[PUMP-TAP][PUMP_POINTER_SELECT]
[PUMP-TAP][PUMP_SELECT]
[PUMP-TAP][STATE] pumpTapFrom="pump:XX"

Aplicar:
.\Dirac_SCADA_pump_select_fix_v13_7\APLICAR_FIX_PUMP_SELECT_V13_7.ps1
