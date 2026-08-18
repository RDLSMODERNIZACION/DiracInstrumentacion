DIRAC SCADA - ORIENTACION DE BOMBAS V8

Supabase YA fue configurado con:
  pumps.orientacion = 'vertical' | 'horizontal'

Clasificacion actual:
- Bomba Pozo -> vertical
- Pozo YPF -> vertical
- resto -> horizontal

Este ZIP conecta esa columna con toda la aplicación:

BACKEND
- Backend/app/routes/infraestructura/layout.py
- get_layout_combined devuelve orientacion para nodos pump.

FRONTEND
- types.ts reconoce orientacion.
- InfraDiagram.tsx copia orientacion del DTO al nodo UI.
- PumpNodeView.tsx prioriza n.orientacion.
- EditableEdge.tsx utiliza orientacion para elegir puntos de conexion.

USO
1. Descomprimir Dirac_SCADA_orientacion_bombas_v8 dentro de la raíz de DiracInstrumentacion.
2. PowerShell, desde la raíz:

   .\Dirac_SCADA_orientacion_bombas_v8\APLICAR_ORIENTACION_BOMBAS_V8.ps1

3. Probar:
   cd FrontEnd\App_2
   npm run dev

IMPORTANTE
- No vuelve a modificar Supabase.
- Para producción, el Backend debe subirse/redeployarse para que el endpoint entregue orientacion.
