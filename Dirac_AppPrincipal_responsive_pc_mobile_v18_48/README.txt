DIRAC APP PRINCIPAL - RESPONSIVE PC + MOBILE V18.48

Objetivo:
Mantener mobile-first, pero hacer que Operaciones se vea bien en escritorio.

Mobile:
- una sola columna;
- tanque primero;
- bombas apiladas.

PC:
- columna izquierda fija de 300px para tanque(s);
- bombas a la derecha;
- 2 columnas normales;
- 3 columnas en pantallas muy grandes;
- tarjetas de bomba mas compactas;
- menos espacio vacio.

No reintroduce click en TankCard ni PumpCard.

Aplicar:
powershell -ExecutionPolicy Bypass -File .\Dirac_AppPrincipal_responsive_pc_mobile_v18_48\APLICAR_RESPONSIVE_PC_MOBILE_V18_48.ps1

Luego:
cd FrontEnd\App_Principal
npm run build
