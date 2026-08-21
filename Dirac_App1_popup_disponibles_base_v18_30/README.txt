DIRAC APP 1 - POPUP DISPONIBILIDAD REAL V18.30

Objetivo
--------
El popup del gráfico de impulsión debe mostrar solamente:
- cuántas bombas estaban encendidas en ese minuto
- cuántas bombas están disponibles según la base
- cuáles eran las bombas encendidas en ese minuto

Disponibilidad
--------------
La cantidad Disponible sale de:
public.pumps.disponible = true
AND
public.pumps.rol_red = 'impulsion_principal'

No usa Online / comunicación como disponibilidad.

Nombres de bombas encendidas
----------------------------
Se habilita pump timeline también cuando la vista está en Todas las localidades,
para que el tooltip pueda listar los nombres.

Aplicar
-------
powershell -ExecutionPolicy Bypass -File .\Dirac_App1_popup_disponibles_base_v18_30\APLICAR_POPUP_DISPONIBLES_BASE_V18_30.ps1

Luego
-----
cd FrontEnd\App_1
npm run dev
