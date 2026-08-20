DIRAC SCADA - FIX PUMP PIPE TAPS V13.4

Este fix cambia la estrategia:

ANTES
- había un hit-area invisible separado de la cañería visible

AHORA
- al seleccionar una bomba, la cañería se pinta con una franja celeste de 18 px
- ESA MISMA franja celeste recibe el click
- ya no dependemos del hit-area invisible
- click -> calcula coordenada SVG -> llama directo a onTapPipeClick

Además agrega logs que coinciden con la versión compacta actual de InfraDiagram:
[PUMP-TAP][PUMP_SELECT]
[PUMP-TAP][STATE]
[PUMP-TAP][HIGHLIGHT_POINTER]
[PUMP-TAP][HIGHLIGHT_DISPATCH]
[PUMP-TAP][PIPE_HANDLER]

Aplicar:
.\Dirac_SCADA_pump_pipe_taps_fix_v13_4\APLICAR_FIX_PUMP_PIPE_TAPS_V13_4.ps1
