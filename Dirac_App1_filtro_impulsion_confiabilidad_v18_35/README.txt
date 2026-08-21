DIRAC APP 1 - FILTRO IMPULSIÓN V18.35

Esta versión usa anclajes reales de ReliabilityPage.tsx.

Agrega:
- botón Impulsión
- botón Todas
- Impulsión queda seleccionado por defecto
- muestra cuántas bombas de impulsión encontró

Los IDs se obtienen desde:
/infraestructura/pump_availability

Ese endpoint devuelve las bombas con:
rol_red = 'impulsion_principal'

El filtro afecta:
- KPIs
- gráfico mensual
- tabla mensual ordenable

Aplicar:
powershell -ExecutionPolicy Bypass -File .\Dirac_App1_filtro_impulsion_confiabilidad_v18_35\APLICAR_FILTRO_IMPULSION_V18_35.ps1

Después:
cd FrontEnd\App_1
npm run dev
