DIRAC APP 1 - GRÁFICOS EN EL TIEMPO V18.11

Corrige V18.10.

El usuario pidió:
- gráfico de bombas en el tiempo, tal como estaba originalmente
- gráfico de tanques en el tiempo al lado
- usar solo equipos principales
- detalle agrupado por localidad
- diseño sutil

BOMBAS PRINCIPALES:
12,13,14,15,16,17,18,24,25,26,29,30

TANQUES PRINCIPALES:
7 Hormigón
8 TK 1000
9 TK2
10 TK1
11 TK3
12 Pulmón
21 TK 160

IMPORTANTE:
Esta versión NO intenta inventar otra fuente para los tanques.
Reutiliza playback.tankTs y playback.pumpTs, exactamente las series
que alimentaban los gráficos originales que sí tenían datos.

Aplicar:
powershell -ExecutionPolicy Bypass -File .\Dirac_App1_graficos_tiempo_principales_v18_11\APLICAR_GRAFICOS_TIEMPO_V18_11.ps1

Después:
cd FrontEnd\App_1
npm run dev
