DIRAC SCADA - SIN PANEL DE LOCALIDAD V11

Este parche elimina la apertura del panel lateral "LOCALIDAD / Sin ubicación"
cuando hacés click sobre una zona del sinóptico.

No modifica:
- Supabase
- posiciones
- equipos
- conexiones

Uso:
1. Descomprimir esta carpeta en la raíz de DiracInstrumentacion.
2. Ejecutar:

   .\Dirac_SCADA_sin_location_drawer_v11\SACAR_PANEL_LOCALIDAD.ps1

3. Luego:
   cd FrontEnd\App_2
   npm run dev
