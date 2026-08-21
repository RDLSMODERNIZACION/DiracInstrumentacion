DIRAC APP 1 - FIX INTEGRACIÓN RED V18.6

Corrige:
Unterminated JSX contents en src/widget/index.tsx

Causa:
V18.5 reemplazó el bloque Operación con regex y cortó JSX anidado.

V18.6:
- reconstruye SOLO index.tsx desde git HEAD
- no toca los componentes ni otros archivos locales
- agrega WaterNetworkOverviewDemo
- NO elimina el JSX viejo: lo desactiva con `false &&`
- evita los selectores grandes en la pestaña Operación
- mantiene las otras pestañas intactas

Requisito:
V18.4 debe seguir aplicado, porque contiene:
FrontEnd/App_1/src/components/red/WaterNetworkOverview.tsx
FrontEnd/App_1/src/components/red/WaterNetworkOverview.demo.tsx

Aplicar:
powershell -ExecutionPolicy Bypass -File .\Dirac_App1_fix_integracion_red_v18_6\APLICAR_FIX_INTEGRACION_RED_V18_6.ps1

Después:
cd FrontEnd\App_1
npm run dev
