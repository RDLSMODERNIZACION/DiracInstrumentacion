DIRAC APP 1 - FILTRO IMPULSIÓN CONFIABILIDAD V18.33

El V18.32 dependía de principalPumpIds en index.tsx y fallaba si ese parche
no estaba aplicado.

V18.33 es independiente:
- modifica solamente ReliabilityPage.tsx
- consulta /infraestructura/pump_availability
- ese endpoint ya devuelve las bombas con rol_red = impulsion_principal
- arma internamente el Set de IDs
- filtra gráfico y tabla

Botones:
- Impulsión (por defecto)
- Todas

No necesita V18.22.

Aplicar:
powershell -ExecutionPolicy Bypass -File .\Dirac_App1_filtro_impulsion_confiabilidad_v18_33\APLICAR_FILTRO_IMPULSION_V18_33.ps1

Después:
cd FrontEnd\App_1
npm run dev
