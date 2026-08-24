DIRAC APP PRINCIPAL - FIX ORDEN DB V18.54

La base ya tiene correctamente:
public.locations.display_order

El problema era que OverviewGrid seguia ejecutando un sort alfabetico por groupName.

V18.54:
- garantiza location_display_order en /tanks/config
- garantiza location_display_order en /pumps/config
- lo conserva en usePlant
- OverviewGrid ordena usando el valor real que viene de la DB
- NO depende del nombre de la localidad

Orden esperado:
1 IIITK
2 TK HORMIGON
3 TK PULMON
4 TK 1000
5 Confluencia 1
6 Confluencia 2
7 Bombeo Viejo
8 Planta Nueva

Aplicar:
powershell -ExecutionPolicy Bypass -File .\Dirac_AppPrincipal_fix_orden_db_v18_54\APLICAR_FIX_ORDEN_DB_V18_54.ps1

Luego:
cd FrontEnd\App_Principal
npm run build

Despues commit + push.
