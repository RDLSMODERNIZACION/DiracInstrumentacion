DIRAC APP 1 - RED RESUMEN V18.4

Este paquete es el PRIMER PASO del rediseño de App_1.
No toca backend ni rompe la pantalla actual.
Agrega componentes nuevos para empezar la vista profesional:

- Red de agua
- Impulsión
- Distribución
- Conclusión operativa
- detalle de horas de encendido de bombas

Archivos agregados:
FrontEnd/App_1/src/components/red/WaterNetworkOverview.tsx
FrontEnd/App_1/src/components/red/WaterNetworkOverview.demo.tsx

Aplicar:
.\Dirac_App1_red_resumen_v18_4\APLICAR_RED_RESUMEN_V18_4.ps1

Luego, en la vista Operación actual:
1) import WaterNetworkOverviewDemo from '@/components/red/WaterNetworkOverview.demo';
2) renderizar <WaterNetworkOverviewDemo />

Cuando lo veamos funcionando, el siguiente paso es:
- conectar datos reales
- definir bombas principales de impulsión
- definir tanques principales de distribución
- ocultar filtros y tablas viejas
- reemplazar el demo por el resumen real
