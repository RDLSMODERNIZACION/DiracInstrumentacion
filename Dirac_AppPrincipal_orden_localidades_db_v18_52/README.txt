DIRAC - ORDEN DE LOCALIDADES DESDE BASE V18.52

La base Supabase ya fue actualizada con public.locations.display_order y nombres limpios.

Orden:
1 IIITK
2 TK HORMIGON
3 TK PULMON
4 TK 1000
5 Confluencia 1
6 Confluencia 2
7 Bombeo Viejo
8 Planta Nueva
9 AC1000
10 Cargaderos

Aplicar:
powershell -ExecutionPolicy Bypass -File .\Dirac_AppPrincipal_orden_localidades_db_v18_52\APLICAR_ORDEN_LOCALIDADES_DB_V18_52.ps1

Luego:
cd FrontEnd\App_Principal
npm run build

Despues commit + push porque cambia backend y frontend.
