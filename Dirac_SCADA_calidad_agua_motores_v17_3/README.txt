DIRAC SCADA - CALIDAD DE AGUA + MOTORES V17.3

TANQUES / POZOS
Se agrega dentro del cuerpo:
- Cl₂ (cloro residual)
- pH

Por ahora:
- si no existe chlorine_mg_l => -- mg/L
- si no existe ph => --

El componente ya queda preparado para datos reales:
n.chlorine_mg_l
n.ph

BOMBAS / MOTORES
Se elimina por completo la pastilla ON/OFF.
La marcha ya se reconoce visualmente por el giro del impulsor.

Se agrega:
- M = Manual (hardcodeado por ahora)
- -- A = amperaje pendiente de dato real

El componente queda preparado para:
n.current_a
n.amperes
n.current

Aplicar:
.\Dirac_SCADA_calidad_agua_motores_v17_3\APLICAR_CALIDAD_MOTORES_V17_3.ps1

Después:
cd FrontEnd\App_2
npm run dev
