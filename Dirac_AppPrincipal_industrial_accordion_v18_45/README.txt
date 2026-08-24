DIRAC APP PRINCIPAL - INDUSTRIAL MOBILE + ACORDEON V18.45

Corrige el error de V18.44 causado por caracteres Unicode dentro del propio PS1.

Esta version:
- PS1 solo ASCII;
- acordeon por ubicacion;
- una sola ubicacion abierta;
- resumen cerrado con nivel promedio;
- elimina tanque 3D;
- usa barra industrial horizontal 0-100;
- porcentaje grande;
- no muestra Online si esta normal;
- solo muestra alarmas o Sin comunicacion.

Aplicar:
powershell -ExecutionPolicy Bypass -File .\Dirac_AppPrincipal_industrial_accordion_v18_45\APLICAR_INDUSTRIAL_ACORDEON_V18_45.ps1

Luego:
cd FrontEnd\App_Principal
npm run build
