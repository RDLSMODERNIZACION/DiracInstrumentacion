DIRAC SCADA - PUMP PIPE TAPS V13

Supabase ya fue modificado con public.layout_pump_pipe_taps.
La bomba deja de usar entrada/salida visuales y se conecta a un único punto de cañería.

Uso: Editar -> Conectar -> click bomba -> click cañería -> 1 inyecta / 2 extrae.

Aplicar:
.\Dirac_SCADA_pump_pipe_taps_v13\APLICAR_PUMP_PIPE_TAPS_V13.ps1

Luego:
cd FrontEnd\App_2
npm run dev

Para producción hay que redeployar Backend.
