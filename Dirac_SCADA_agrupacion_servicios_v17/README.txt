DIRAC SCADA - AGRUPACIÓN POR SERVICIO V17

Supabase ya fue actualizado con el campo servicio:
- tanks
- pumps
- manifolds
- network_analyzers

Valores:
- agua
- cargaderos
- cloacas

Se clasificaron automáticamente como CARGADEROS los equipos cuyo nombre
contiene "Cargadero".

Pestañas superiores:
- Todos
- Agua
- Cargaderos de agua
- Cloacas

En Editar:
1. click en tanque o bomba
2. aparece selector Grupo
3. elegís Agua / Cargaderos / Cloacas
4. se guarda en Supabase

Tanques:
- muestran TIPO + GRUPO
- ejemplo: POZO · AGUA
- ejemplo: TANQUE · CLOACAS
- los de CLOACAS se dibujan verdes

Aplicar:
.\Dirac_SCADA_agrupacion_servicios_v17\APLICAR_AGRUPACION_SERVICIOS_V17.ps1

Después reiniciar Backend y FrontEnd/App_2.
