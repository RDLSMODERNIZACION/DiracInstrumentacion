DIRAC SCADA - CALIDAD + MOTORES V17.5

TANQUES / POZOS
Dentro del tanque se muestra:
- CLORO: -- mg/L
- pH: --

Queda preparado para:
- n.chlorine_mg_l
- n.ph

BOMBAS
Se elimina el indicador ON/OFF porque el giro ya indica marcha.

Se muestra:
- M = Manual (hardcodeado por ahora)
- -- A = corriente pendiente de dato real

Queda preparado para:
- n.current_a
- n.amperes
- n.current

Aplicar:
.\Dirac_SCADA_calidad_motores_v17_5\APLICAR_CALIDAD_MOTORES_V17_5.ps1

Después:
cd FrontEnd\App_2
npm run dev
