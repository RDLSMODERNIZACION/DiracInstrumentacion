DIRAC APP 1 - POPUP DISPONIBILIDAD REAL V18.31

V18.30 fallaba porque buscaba una forma exacta del bloque de props de
OpsPumpsProfile y el archivo local ya había cambiado.

V18.31 usa búsquedas estructurales/regex más tolerantes.

POPUP:
- Bombas encendidas en ese minuto
- Bombas disponibles desde public.pumps.disponible
- Lista de bombas encendidas

Disponibilidad:
solo cuenta bombas con:
rol_red = 'impulsion_principal'
AND disponible = true

También carga timeline en Operación aunque la vista sea Todas las localidades,
para que el popup pueda listar nombres.

Aplicar:
powershell -ExecutionPolicy Bypass -File .\Dirac_App1_popup_disponibles_base_v18_31\APLICAR_POPUP_DISPONIBLES_BASE_V18_31.ps1

Después:
cd FrontEnd\App_1
npm run dev
