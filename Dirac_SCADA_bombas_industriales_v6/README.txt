DIRAC SCADA - BOMBAS INDUSTRIALES V6

Este paquete SOLO modifica frontend.

Cambios:
- Bomba circular -> bomba vertical industrial tipo booster.
- Motor vertical naranja/gris.
- Cabezal superior.
- Pedestal/base.
- Succión y descarga laterales.
- Estado ON / OFF / OFFLINE / MANT.
- Ajuste de los puntos de conexión de las cañerías a la nueva forma.

NO TOCA:
- Supabase
- posiciones
- layout
- tablas
- edges de base de datos

USO:
1. Descomprimir Dirac_SCADA_bombas_industriales_v6 en la raíz de DiracInstrumentacion.
2. Ejecutar:
   .\Dirac_SCADA_bombas_industriales_v6\APLICAR_BOMBAS_INDUSTRIALES_V6.ps1
3. Luego:
   cd FrontEnd\App_2
   npm run dev
