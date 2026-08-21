DIRAC APP 1 - PRESERVAR DETALLE V18.13

Objetivo:
Ocultar únicamente los selectores que rompían la composición.

OCULTA:
- selector Ubicación / badges superiores
- selector grande de Tanques
- selector grande de Bombas

CONSERVA:
- gráfico de Impulsión en el tiempo
- gráfico de Distribución / Tanques en el tiempo
- detalle de bombas agrupado por localidad
- detalle de tanques agrupado por localidad
- Tabs

Este parche NO borra JSX.
Solo oculta los controles para minimizar riesgo de romper index.tsx.

Aplicar:
powershell -ExecutionPolicy Bypass -File .\Dirac_App1_preservar_detalle_v18_13\APLICAR_PRESERVAR_DETALLE_V18_13.ps1

Después:
cd FrontEnd\App_1
npm run dev
