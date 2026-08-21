DIRAC APP 1 - TANQUES INTERACTIVOS V18.36

Objetivo:
usar el detalle inferior de Tanques de distribución como selector del gráfico.

Comportamiento:
- Click en "Tanques de distribución"
  -> gráfico de todos los tanques principales.

- Click en una localidad/grupo
  -> gráfico del promedio de los tanques de ese grupo.

- Click en un tanque
  -> gráfico histórico individual de ese tanque.

La selección modifica selectedTankIds y vuelve a usar el mismo flujo de
useLiveOps/playback, por lo que el gráfico se actualiza con datos reales.

Aplicar:
powershell -ExecutionPolicy Bypass -File .\Dirac_App1_tanques_interactivos_v18_36\APLICAR_TANQUES_INTERACTIVOS_V18_36.ps1

Después:
cd FrontEnd\App_1
npm run dev
