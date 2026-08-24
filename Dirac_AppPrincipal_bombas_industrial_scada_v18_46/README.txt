DIRAC APP PRINCIPAL - BOMBAS INDUSTRIAL SCADA V18.46

Basado en los archivos reales del repo.

Incluye:
- backend /pumps/config con disponibilidad y resumen 24h;
- frontend usePlant mapea esos campos;
- PumpCard reemplazada por tarjeta industrial SCADA;
- LED pequeno;
- ENCENDIDA/APAGADA;
- DISPONIBLE/NO DISPONIBLE;
- horas de marcha 24h;
- arranques 24h;
- potencia nominal cuando exista;
- motivo de indisponibilidad;
- grupos con fondo oscuro industrial.

IMPORTANTE:
No muestra amperes individuales porque actualmente no hay una medicion individual
de corriente por bomba en /pumps/config. No se inventan valores.

Aplicar:
powershell -ExecutionPolicy Bypass -File .\Dirac_AppPrincipal_bombas_industrial_scada_v18_46\APLICAR_BOMBAS_INDUSTRIAL_SCADA_V18_46.ps1

Luego:
cd FrontEnd\App_Principal
npm run build

Como cambia Backend/app/routes/pumps.py, despues commit + push para desplegar backend.
