DIRAC SCADA - TANQUES, BOMBAS Y CONEXIONES V7

Este paquete SOLO modifica frontend.

Incluye:
- TankNodeView.tsx mejorado:
  - tanque mas industrial
  - entrada superior visible
  - salida inferior visible
  - boquillas laterales mas claras
  - forma mejor resuelta para que las cañerias parezcan salir/entrar del equipo

- PumpNodeView.tsx mejorado:
  - bomba vertical tipo booster
  - soporte para bomba horizontal
  - estado ON / OFF / OFFLINE / MANT.
  - conexiones visuales mas claras

- Ajustes en EditableEdge.tsx:
  - puntos de conexion de tanque mejor alineados
  - soporte para bombas horizontales y verticales
  - preparado para series simples usando L/R en horizontal y vertical

- Ajustes en InfraDiagram.tsx:
  - tamanos logicos de tanque/bomba actualizados

NOTA SOBRE BOMBAS HORIZONTALES
El frontend ya queda listo para bombas horizontales.
Para usar una bomba horizontal, el nodo debe traer:
  meta.orientation = "horizontal"
o
  orientation = "horizontal"

USO:
1. Descomprimir Dirac_SCADA_tanques_bombas_conexiones_v7 en la raiz de DiracInstrumentacion.
2. Ejecutar:
   .\Dirac_SCADA_tanques_bombas_conexiones_v7\APLICAR_TANQUES_BOMBAS_CONEXIONES_V7.ps1
3. Luego:
   cd FrontEnd\App_2
   npm run dev

NO TOCA SUPABASE.
