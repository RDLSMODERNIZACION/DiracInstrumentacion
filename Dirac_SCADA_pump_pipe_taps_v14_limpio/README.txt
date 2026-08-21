DIRAC SCADA - PUMP PIPE TAPS V14 LIMPIO

Corrección completa del sistema bomba -> cañería:
- selección directa de bomba, sin CustomEvent
- PumpNodeView con props correctos
- TankNodeView deja de recibir props de bomba por error
- las bombas ya no muestran puertos del sistema viejo en modo conectar
- la franja celeste indica y recibe el click sobre la cañería
- Aceptar = INYECTA / Cancelar = EXTRAE
- al guardar desaparece la guía celeste
- mantiene PumpPipeTapView como vínculo definitivo
- elimina logs temporales PUMP-TAP
- no modifica Supabase

APLICAR:
.\Dirac_SCADA_pump_pipe_taps_v14_limpio\APLICAR_PUMP_PIPE_TAPS_V14.ps1

DESPUÉS:
cd FrontEnd\App_2
npm run dev
