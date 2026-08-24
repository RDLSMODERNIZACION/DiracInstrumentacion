DIRAC APP PRINCIPAL - INDUSTRIAL MOBILE + ACORDEON V18.44

Cambios principales:
- cada ubicacion funciona como acordeon;
- solo una ubicacion abierta a la vez;
- cerrada muestra nombre, cantidad y nivel promedio;
- tanques sin dibujo 3D;
- nivel representado por barra industrial horizontal;
- porcentaje grande;
- marcas 0 / 25 / 50 / 75 / 100;
- no muestra Online si todo esta bien;
- solo muestra Sin comunicacion o alarma;
- mantiene PumpCard existente.

Aplicar:
powershell -ExecutionPolicy Bypass -File .\Dirac_AppPrincipal_industrial_accordion_v18_44\APLICAR_INDUSTRIAL_ACORDEON_V18_44.ps1

Luego:
cd FrontEnd\App_Principal
npm run build
