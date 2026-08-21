DIRAC SCADA - FIX CALIDAD VISIBLE V17.4

El V17.3 no llegó a insertar el bloque visual en tu TankNodeView actual.

V17.4:
- busca el porcentaje del tanque mediante regex
- inserta el bloque después del porcentaje
- fondo blanco opaco para que se vea sobre el agua
- Cloro y pH separados en dos columnas
- aplica también a pozos

Visual:
┌─────────────────┐
│ CLORO    pH     │
│ -- mg/L  --     │
└─────────────────┘

Aplicar:
.\Dirac_SCADA_fix_calidad_tanque_visible_v17_4\APLICAR_FIX_CALIDAD_VISIBLE_V17_4.ps1

Después:
cd FrontEnd\App_2
npm run dev
