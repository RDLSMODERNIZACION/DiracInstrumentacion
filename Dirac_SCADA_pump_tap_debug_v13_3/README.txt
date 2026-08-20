DIRAC SCADA - DEBUG PUMP TAPS V13.3

Agrega logs con prefijo [PUMP-TAP] en:

Frontend:
- selección de bomba
- click en cañería
- coordenada SVG
- dispatch al handler
- request de guardado
- status HTTP
- guardado OK

Backend:
- payload recibido
- fila guardada en Supabase

Aplicar desde la raíz:
.\Dirac_SCADA_pump_tap_debug_v13_3\APLICAR_DEBUG_PUMP_TAPS_V13_3.ps1

Luego:
1. reiniciar frontend y backend
2. Chrome F12 > Console
3. filtrar por: PUMP-TAP
4. Editar > Conectar > bomba > cañería
5. pasarme los logs
