DIRAC SCADA - PUMP PIPE TAPS V14.2

DIAGNOSTICO

El cableado actual está correcto:
- InfraDiagram pasa tapConnectMode
- pasa tapSelected
- pasa onTapSelect
- PumpNodeView llama onTapSelect(n.id)

El problema más probable de los parches acumulados es el doble/múltiple disparo:
antes se usaba:

setPumpTapFrom((prev) => (prev === nodeId ? null : nodeId))

Si el evento entra 2 veces:
1) null -> pump:19
2) pump:19 -> null

Por eso visualmente parecía que nunca quedaba seleccionada.

V14.2 lo hace idempotente:

setPumpTapFrom(nodeId)

Aunque el evento entre varias veces, siempre queda pump:19.

Además:
- elimina el log [PUMP-TAP][STATE]
- elimina listeners globales viejos dirac:pump-tap-select
- elimina logs temporales [PUMP-TAP]
- no toca Supabase
- no toca EditableEdge
- no cambia el diseño

APLICAR:

.\Dirac_SCADA_pump_pipe_taps_v14_2\APLICAR_PUMP_PIPE_TAPS_V14_2.ps1

DESPUÉS:

cd FrontEnd\App_2
npm run dev

PRUEBA:
Editar -> Conectar -> click una bomba

La bomba debe quedar con borde azul y las cañerías deben quedar resaltadas/clickeables.
