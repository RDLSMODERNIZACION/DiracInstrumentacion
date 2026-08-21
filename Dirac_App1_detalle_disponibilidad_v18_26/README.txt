DIRAC APP 1 - DETALLE DISPONIBILIDAD V18.26

Cambio visual en Bombas de impulsión:

ANTES:
Bomba | Estado | Disponibilidad | h encendida | Arranques

AHORA:
Bomba | Estado | Disponibilidad | Detalle

- Se eliminan las dos columnas de la derecha (horas y arranques).
- El selector Disponible / No disponible se mantiene.
- Cuando seleccionás No disponible, aparece el campo Detalle / motivo.
- Guardar persiste disponibilidad + descripción en Supabase.
- Si la bomba está Disponible, Detalle muestra solamente —.

Aplicar:
powershell -ExecutionPolicy Bypass -File .\Dirac_App1_detalle_disponibilidad_v18_26\APLICAR_DETALLE_DISPONIBILIDAD_V18_26.ps1

Después:
cd FrontEnd\App_1
npm run dev
