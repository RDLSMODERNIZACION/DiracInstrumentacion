DIRAC APP1 - DISPONIBILIDAD EDITABLE EN BOMBAS DE IMPULSIÓN V18.24

Qué agrega
----------
- En el detalle de Bombas de impulsión aparece un selector por fila:
  * Disponible
  * No disponible
- Si elegís No disponible, aparece un campo para escribir la descripción.
- Cada fila tiene botón Guardar.

También incluye
---------------
- Backend actualizado en pump_availability.py
- SQL para agregar la columna disponibilidad_descripcion en public.pumps

Aplicación
----------
powershell -ExecutionPolicy Bypass -File .\Dirac_App1_disponibilidad_selector_v18_24\APLICAR_DISPONIBILIDAD_SELECTOR_V18_24.ps1

Después
-------
1) Ejecutar SQL en Supabase:
   .\Dirac_App1_disponibilidad_selector_v18_24\01_SQL_SUPABASE_disponibilidad_descripcion.sql

2) Reiniciar backend / redeploy Render.

3) Frontend:
   cd FrontEnd\App_1
   npm run dev
