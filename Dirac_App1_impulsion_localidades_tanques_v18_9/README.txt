DIRAC APP 1 - IMPULSIÓN POR LOCALIDAD + GRÁFICO DE TANQUES V18.9

Qué hace:
- reemplaza WaterNetworkOverviewLive.tsx
- Impulsión:
  * mantiene las 12 bombas reales
  * agrupa el detalle por localidad
  * muestra ON/OFF/OFFLINE y Disponibilidad / No disponible
- Distribución:
  * vuelve a mostrar un gráfico de tanques
  * muestra nivel actual por tanque principal
  * agrupa también por localidad

Datos:
- /infraestructura/pump_availability
- /infraestructura/get_layout_combined
- /kpi/tanques/live

Aplicar:
powershell -ExecutionPolicy Bypass -File .\Dirac_App1_impulsion_localidades_tanques_v18_9\APLICAR_IMPULSION_LOCALIDADES_TANQUES_V18_9.ps1

Después:
cd FrontEnd\App_1
npm run dev
