DIRAC SCADA - CONEXIONES RECTAS DE BOMBAS V14.7

Problema:
Las bombas verticales dibujaban el ramal así:

bomba ----+
          +--------- cañería

porque PumpPipeTapView hacía un recorrido ortogonal con un codo
al 45% de la distancia.

Solución:
- Detecta orientacion vertical/horizontal.
- Bomba vertical: ramal horizontal recto hacia la cañería.
- La línea nace del lateral del cuerpo de la bomba.
- Si existe una diferencia extrema de altura, el único codo queda
  pegado a la bomba, no en mitad del ramal.
- Mantiene animación de flujo.
- Mantiene inject/extract.
- No toca Supabase.
- No toca posiciones.
- No toca InfraDiagram.

Aplicar:
.\Dirac_SCADA_conexiones_bombas_rectas_v14_7\APLICAR_CONEXIONES_RECTAS_V14_7.ps1

Después:
cd FrontEnd\App_2
npm run dev
