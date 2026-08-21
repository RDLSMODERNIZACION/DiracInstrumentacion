DIRAC SCADA - FIX BOMBAS V17.6

El parche anterior falló porque buscaba un bloque ON/OFF exacto que ya no
coincidía con tu PumpNodeView local.

Esta versión NO hace reemplazos parciales:
reemplaza PumpNodeView.tsx completo.

Mantiene:
- bomba horizontal
- bomba vertical
- animación correcta del impulsor
- Pump Pipe Tap
- selección en modo conectar
- drag en edición

Nuevo:
- M = Manual hardcodeado
- -- A = corriente pendiente
- preparado para current_a / amperes / current
- eliminado ON/OFF visual

Aplicar:
.\Dirac_SCADA_fix_bombas_manual_amperes_v17_6\APLICAR_FIX_BOMBAS_V17_6.ps1

Después:
cd FrontEnd\App_2
npm run dev
