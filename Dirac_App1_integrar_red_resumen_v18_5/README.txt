DIRAC APP 1 - INTEGRACIÓN RED RESUMEN V18.5

Este paquete integra automáticamente la nueva vista profesional en App_1.

Qué hace:
- agrega:
  import WaterNetworkOverviewDemo from "@/components/red/WaterNetworkOverview.demo";
- reemplaza el contenido actual de la pestaña Operación por:
  <WaterNetworkOverviewDemo />

Requisito:
haber aplicado antes V18.4.

Aplicar:
powershell -ExecutionPolicy Bypass -File .\Dirac_App1_integrar_red_resumen_v18_5\APLICAR_INTEGRACION_RED_V18_5.ps1

Después:
cd FrontEnd\App_1
npm run dev
