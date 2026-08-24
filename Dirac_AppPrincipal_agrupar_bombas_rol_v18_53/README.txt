DIRAC APP PRINCIPAL - AGRUPAR BOMBAS POR ROL V18.53

Diferencia bombas en TODAS las localidades usando public.pumps.rol_red.

Principal:
rol_red = impulsion_principal

Auxiliar:
cualquier otro rol.

Ejemplo Bombeo Viejo:
IMPULSION PRINCIPAL
- PE BOMBA 1
- PE BOMBA 2
- PE BOMBA 3

BOMBAS AUXILIARES
- Bomba Pozo
- Retrolavado 1
- Retrolavado 2

Modifica:
- Backend/app/routes/pumps.py
- FrontEnd/App_Principal/src/components/scada/hooks/usePlant.ts
- FrontEnd/App_Principal/src/components/scada/pages/OverviewGrid.tsx

Aplicar:
powershell -ExecutionPolicy Bypass -File .\Dirac_AppPrincipal_agrupar_bombas_rol_v18_53\APLICAR_AGRUPAR_BOMBAS_ROL_V18_53.ps1

Luego:
cd FrontEnd\App_Principal
npm run build

Despues commit + push.
