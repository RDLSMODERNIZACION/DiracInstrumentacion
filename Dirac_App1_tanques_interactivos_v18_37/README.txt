DIRAC APP 1 - TANQUES INTERACTIVOS V18.37

Corrige el error de PowerShell de V18.36:
"No se puede convertir el argumento matchTimeout..."

La causa era un overload incorrecto de [regex]::Replace.

V18.37 usa objetos Regex explícitos y mantiene la misma funcionalidad:

- Click en "Tanques de distribución" -> vuelve a todos los principales.
- Click en una localidad/grupo -> gráfico del conjunto de esa localidad.
- Click en un tanque -> gráfico individual de ese tanque.

Aplicar:
powershell -ExecutionPolicy Bypass -File .\Dirac_App1_tanques_interactivos_v18_37\APLICAR_TANQUES_INTERACTIVOS_V18_37.ps1

Después:
cd FrontEnd\App_1
npm run dev
