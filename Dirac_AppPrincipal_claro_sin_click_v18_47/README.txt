DIRAC APP PRINCIPAL - CLARO + SIN CLICK V18.47

Mantiene el concepto industrial SCADA pero vuelve a tema claro.

Cambios:
- fondo blanco;
- borde gris fino;
- LEDs pequenos;
- tipografia tecnica;
- conserva ENCENDIDA/APAGADA;
- conserva DISPONIBLE/NO DISPONIBLE;
- conserva horas y arranques;
- elimina flecha de detalle;
- TankCard ya no abre nada al tocar;
- PumpCard ya no abre nada al tocar.

Aplicar:
powershell -ExecutionPolicy Bypass -File .\Dirac_AppPrincipal_claro_sin_click_v18_47\APLICAR_CLARO_SIN_CLICK_V18_47.ps1

Luego:
cd FrontEnd\App_Principal
npm run build
