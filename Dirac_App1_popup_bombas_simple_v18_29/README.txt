DIRAC APP 1 - POPUP BOMBAS SIMPLE V18.29

Objetivo
========
Dejar el popup del gráfico de bombas mostrando solamente lo útil:
- cuántas bombas están encendidas
- cuántas están disponibles
- cuáles son las encendidas

Qué hace este parche
====================
- cambia el popup para priorizar Bombas ON
- relabela Online como Disponibles
- intenta quitar Bombas OFF
- intenta quitar Sin comunicación
- intenta quitar el bloque Apagadas
- deja el bloque "Bombas encendidas en este minuto"

Aplicar
=======
powershell -ExecutionPolicy Bypass -File .\Dirac_App1_popup_bombas_simple_v18_29\APLICAR_POPUP_BOMBAS_SIMPLE_V18_29.ps1

Después
=======
npm run dev

Nota
====
En esta versión, "Disponibles" reutiliza el dato que hoy aparece como Online.
Si querés, en el próximo paso lo conectamos al campo manual de disponibilidad desde base.
