DIRAC APP 1 - FILTRO IMPULSIÓN EN CONFIABILIDAD V18.32

Qué hace:
- agrega un filtro visual en "Operación y confiabilidad"
- opciones:
  - Impulsión
  - Todas
- por defecto queda en "Impulsión"

Cuando está en "Impulsión":
- la tabla mensual ordenable de bombas
- y el gráfico de confiabilidad

se filtran usando principalPumpIds, que vienen de:
public.pumps.rol_red = 'impulsion_principal'

Requisito:
tener aplicado el esquema con roles dinámicos (principalPumpIds cargados).

Aplicar:
powershell -ExecutionPolicy Bypass -File .\Dirac_App1_filtro_impulsion_confiabilidad_v18_32\APLICAR_FILTRO_IMPULSION_CONFIABILIDAD_V18_32.ps1

Después:
cd FrontEnd\App_1
npm run dev
