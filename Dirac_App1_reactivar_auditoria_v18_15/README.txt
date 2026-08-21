DIRAC APP 1 - REACTIVAR AUDITORÍA V18.15

Objetivo:
mantener la nueva vista principal y recuperar solamente la parte de Auditoría.

CONSERVA:
- gráfico de Impulsión
- gráfico de Distribución
- detalle bombas por localidad
- detalle tanques por localidad

RECUPERA:
- Auditoría comparativa
- Comparación directa cuando se activa

NO RECUPERA:
- Eventos operativos recientes
- Resumen por ubicación

Aplicar:
powershell -ExecutionPolicy Bypass -File .\Dirac_App1_reactivar_auditoria_v18_15\APLICAR_REACTIVAR_AUDITORIA_V18_15.ps1

Después:
cd FrontEnd\App_1
npm run dev
