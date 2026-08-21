DIRAC SCADA - POZO ANCHO V14.6

Este reemplaza al V14.5.

El V14.5 falló porque buscaba un bloque exacto de buildPorts y tu
InfraDiagram.tsx ya había cambiado por los parches anteriores.

V14.6:
- busca el inicio: if (n.type === "tank") {
- busca el final: const off = 6;
- reconstruye todo ese bloque
- no depende del formato exacto actual

Cambios visuales:
- pozo W 420
- casing 300 px de ancho
- conexiones laterales dentro del pozo
- dos alturas útiles por lado
- preparado para 2 bombas izquierda + 2 bombas derecha

Aplicar:
.\Dirac_SCADA_pozo_ancho_conexiones_v14_6\APLICAR_POZO_ANCHO_V14_6.ps1

Luego:
cd FrontEnd\App_2
npm run dev
