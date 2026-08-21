DIRAC APP 1 - FORZAR DETALLE BAJO GRÁFICOS V18.14

Problema:
Seguía apareciendo el bloque viejo de Operación:
- Auditoría comparativa
- Eventos operativos
- Resumen por ubicación

y no aparecía debajo de los gráficos:
- Detalle de bombas por localidad
- Detalle de tanques por localidad

V18.14:
- restaura WaterNetworkOverviewLive de V18.11
- desactiva TODOS los bloques viejos activos de Operación
- deja un solo bloque nuevo activo
- conserva los gráficos originales en el tiempo
- fuerza el detalle por localidad debajo de cada gráfico
- oculta BaseSelectors si aún estuviera activo

Aplicar:
powershell -ExecutionPolicy Bypass -File .\Dirac_App1_forzar_detalle_bajo_graficos_v18_14\APLICAR_V18_14.ps1

Después:
cd FrontEnd\App_1
npm run dev
