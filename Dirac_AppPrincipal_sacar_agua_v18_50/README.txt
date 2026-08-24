DIRAC APP PRINCIPAL - SACAR ETIQUETA AGUA V18.50

Quita la pastilla "Agua" / "Cloacas" que aparece a la derecha
del encabezado de cada ubicacion.

Mantiene el selector superior de Servicio.

Aplicar:
powershell -ExecutionPolicy Bypass -File .\Dirac_AppPrincipal_sacar_agua_v18_50\APLICAR_SACAR_AGUA_V18_50.ps1

Luego:
cd FrontEnd\App_Principal
npm run build
