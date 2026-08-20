DIRAC SCADA - LOGS LIMPIOS V13.5

Este parche:
- apaga el logger general de InfraDiagram
- pone DEBUG_EDGE=false
- elimina console.log/console.warn generales
- mantiene console.error reales
- mantiene solamente los logs que empiezan con:
  [PUMP-TAP]

Así la consola queda limpia para diagnosticar únicamente la conexión bomba -> cañería.

Aplicar:
.\Dirac_SCADA_logs_limpios_v13_5\APLICAR_LOGS_LIMPIOS_V13_5.ps1

Luego:
cd FrontEnd\App_2
npm run dev
