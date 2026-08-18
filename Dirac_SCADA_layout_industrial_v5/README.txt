DIRAC SCADA LAYOUT INDUSTRIAL V5

Objetivo:
- Darle un look más industrial al equipo.
- Mejorar la forma de tanques y bombas.
- Suavizar la caja de zonas y la cuadrícula.
- Bajar el peso visual de las cañerías.

Incluye:
- TankNodeView.tsx nuevo (más industrial).
- PumpNodeView.tsx nuevo.
- Ajustes en EditableEdge.tsx e InfraDiagram.tsx.

NO cambia aún las coordenadas en Supabase.
O sea: mejora mucho la forma y el estilo, pero si querés el salto final
después hay que compactar el layout de cada planta.

USO:
1. Descomprimir esta carpeta en la raíz de DiracInstrumentacion.
2. Ejecutar desde PowerShell en la raíz del repo:

   .\Dirac_SCADA_layout_industrial_v5\APLICAR_LAYOUT_INDUSTRIAL_V5.ps1

3. Luego:
   cd FrontEnd\App_2
   npm run dev
