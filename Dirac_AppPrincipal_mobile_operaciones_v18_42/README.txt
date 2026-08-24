DIRAC APP PRINCIPAL - OPERACIONES MOBILE-FIRST V18.42

Basado en los archivos reales del repo:
- src/components/scada/pages/OverviewGrid.tsx
- src/components/scada/widgets.tsx
- src/components/scada/ScadaApp.tsx

Objetivo:
hacer la vista Operaciones mucho mas simple para telefono.

Cambios:
- una columna en telefono;
- toolbar compacta y sticky;
- grupos de ubicacion compactos;
- nombre + cantidad de tanques/bombas;
- no muestra Online cuando el equipo esta conectado;
- solo muestra Sin comunicacion si existe un problema;
- elimina badge Agua repetido dentro de cada tanque;
- no muestra Normal en cada card si todo esta bien;
- tanque visual mas chico en mobile;
- bomba prioriza nombre + ON/OFF;
- ancho mobile maximo para evitar espacios vacios.

Aplicar:
powershell -ExecutionPolicy Bypass -File .\Dirac_AppPrincipal_mobile_operaciones_v18_42\APLICAR_MOBILE_OPERACIONES_V18_42.ps1

Luego:
cd FrontEnd\App_Principal
npm run build
