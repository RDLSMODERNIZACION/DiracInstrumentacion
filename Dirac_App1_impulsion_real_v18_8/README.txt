DIRAC APP 1 - IMPULSIÓN REAL V18.8

Problema:
La vista nueva seguía mostrando datos DEMO (7/9, Oeste 1, etc.).

V18.8:
- elimina el Demo de la pestaña Operación
- consulta /infraestructura/pump_availability
- consulta /infraestructura/get_layout_combined
- muestra las 12 bombas reales de impulsión
- calcula:
  * operando
  * disponibles
  * no disponibles
  * utilización sobre disponibles
  * estado general
- muestra disponibilidad real desde Supabase
- refresca cada 15 segundos

Las columnas:
- h encendida 24h
- arranques 24h
quedan visibles pero en — por ahora.
El siguiente paso es conectarlas al historial real.

Requisito:
haber aplicado V18.7 y redeployado el backend de Render.

Aplicar:
powershell -ExecutionPolicy Bypass -File .\Dirac_App1_impulsion_real_v18_8\APLICAR_IMPULSION_REAL_V18_8.ps1

Luego:
cd FrontEnd\App_1
npm run dev
