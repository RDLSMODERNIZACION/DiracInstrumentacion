DIRAC APP PRINCIPAL - FIX VITE V18.49

Corrige el error:
Unexpected token ... min-height: 100%

Causa:
V18.48 inserto un bloque <style> como hermano del div raiz del return de
OverviewGrid.tsx. Ese JSX no es valido.

V18.49 elimina solamente ese bloque. El layout responsive de V18.48 queda
aplicado porque usa clases Tailwind.

Aplicar:
powershell -ExecutionPolicy Bypass -File .\Dirac_AppPrincipal_fix_vite_v18_49\APLICAR_FIX_VITE_V18_49.ps1

Luego:
cd FrontEnd\App_Principal
npm run build
