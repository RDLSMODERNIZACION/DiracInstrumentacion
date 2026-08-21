DIRAC APP 1 - RESUMEN SUTIL + GRÁFICOS LADO A LADO V18.10

Qué cambia:
- vuelve una composición más sutil
- gráfico de bombas a la izquierda
- gráfico de tanques a la derecha
- métricas compactas
- detalle por localidad de bombas
- detalle por localidad de tanques

Datos:
- /infraestructura/pump_availability
- /infraestructura/get_layout_combined
- /kpi/tanques/live

Aplicar:
powershell -ExecutionPolicy Bypass -File .\Dirac_App1_resumen_sutil_graficos_v18_10\APLICAR_RESUMEN_SUTIL_GRAFICOS_V18_10.ps1

Después:
cd FrontEnd\App_1
npm run dev
