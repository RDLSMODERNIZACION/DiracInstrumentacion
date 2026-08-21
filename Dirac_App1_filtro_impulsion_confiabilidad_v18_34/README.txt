DIRAC APP 1 - FILTRO IMPULSIÓN ROBUSTO V18.34

V18.33 fallaba porque el bloque filteredPumpDaily local no coincidía
exactamente con el bloque esperado.

V18.34:
- localiza filteredPumpDaily y filteredPumpTable con regex estructural
- no depende de index.tsx ni de principalPumpIds
- consulta /infraestructura/pump_availability
- arma los IDs de impulsión internamente
- agrega botones:
    Impulsión
    Todas
- por defecto queda en Impulsión
- filtra gráfico y tabla mensual

Aplicar:
powershell -ExecutionPolicy Bypass -File .\Dirac_App1_filtro_impulsion_confiabilidad_v18_34\APLICAR_FILTRO_IMPULSION_V18_34.ps1

Después:
cd FrontEnd\App_1
npm run dev
