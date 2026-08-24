DIRAC APP PRINCIPAL - MOBILE FIRST V18.43

Corrige V18.42:
- elimina uso invalido de String.Replace con 3 argumentos;
- usa regex estructural;
- tolera que V18.42 haya aplicado cambios parciales;
- es idempotente: puede correrse sobre un archivo ya parcialmente modificado.

Aplica sobre:
FrontEnd/App_Principal/src/components/scada/pages/OverviewGrid.tsx
FrontEnd/App_Principal/src/components/scada/widgets.tsx
FrontEnd/App_Principal/src/components/scada/ScadaApp.tsx

Aplicar:
powershell -ExecutionPolicy Bypass -File .\Dirac_AppPrincipal_mobile_operaciones_v18_43\APLICAR_MOBILE_OPERACIONES_V18_43.ps1

Luego:
cd FrontEnd\App_Principal
npm run build
