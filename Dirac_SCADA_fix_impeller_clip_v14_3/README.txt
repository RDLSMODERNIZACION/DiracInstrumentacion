DIRAC SCADA - FIX IMPELLER CLIP V14.3

Corrige el problema visual donde las aspas de las bombas ON se salen del círculo.

Qué hace:
- agrega clipPath para recortar el rotor dentro del círculo
- achica un poco las aspas
- aplica la corrección tanto a bombas horizontales como verticales
- no toca Supabase
- no toca la lógica de conexión bomba -> cañería

Aplicar desde la raíz:

.\Dirac_SCADA_fix_impeller_clip_v14_3\APLICAR_FIX_IMPELLER_CLIP_V14_3.ps1

Después:
cd FrontEnd\App_2
npm run dev
