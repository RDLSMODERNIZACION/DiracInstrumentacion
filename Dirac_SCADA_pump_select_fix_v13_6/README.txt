DIRAC SCADA - FIX PUMP SELECT V13.6

Los logs mostraron:
- editMode = true
- connectMode = true
- pumpTapFrom = null

Por eso el problema está en el click de la bomba, no en la cañería.

Este fix:
- desactiva drag de bomba durante modo Conectar
- deja la bomba clickeable
- mantiene drag normal fuera de modo Conectar
- agrega log [PUMP-TAP][PUMP_SELECT]

Aplicar:
.\Dirac_SCADA_pump_select_fix_v13_6\APLICAR_FIX_PUMP_SELECT_V13_6.ps1

Después:
cd FrontEnd\App_2
npm run dev
