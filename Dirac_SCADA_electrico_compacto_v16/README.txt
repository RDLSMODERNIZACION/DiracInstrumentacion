DIRAC SCADA - ELÉCTRICO COMPACTO V16

Vista normal:
┌─────────────┐
│ ⚡ ELÉCTRICO │
│   84.2      │
│    kW       │
└─────────────┘

Click sobre el cuadrado:
- P kW
- Q kVAr
- S kVA
- PF
- Hz
- V12 / V23 / V31
- I1 / I2 / I3

Reglas:
- verde: lectura online y normal
- naranja: PF < 0.96
- gris: offline
- en Editar sigue funcionando como nodo arrastrable
- al entrar a Editar se cierra automáticamente el detalle

No toca:
- Supabase
- backend
- conexiones
- bombas
- P/Q

Aplicar:
.\Dirac_SCADA_electrico_compacto_v16\APLICAR_ELECTRICO_COMPACTO_V16.ps1

Después:
cd FrontEnd\App_2
npm run dev
