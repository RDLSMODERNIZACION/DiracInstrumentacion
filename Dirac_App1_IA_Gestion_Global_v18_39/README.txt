DIRAC APP 1 - IA OPERACIONAL EN GESTIÓN GLOBAL V18.39

QUÉ AGREGA
==========
Gestión global pasa a ser una pantalla de Inteligencia operacional.

La pantalla muestra:
- reserva real en m3 y %
- tendencia de almacenamiento
- bombas en marcha / disponibles
- alertas operativas de la base
- estado eléctrico por planta
- hallazgos de IA
- acciones sugeridas por IA
- botón Reanalizar operación

BACKEND
=======
GET  /kpi/ai/context
POST /kpi/ai/analyze
GET  /kpi/ai/latest

El backend consulta:
- kpi.v_ai_network_now
- kpi.v_ai_active_alerts
- kpi.v_ai_electrical_now
- kpi.v_ai_impulsion_now
- kpi.v_ai_distribution_now
- kpi.v_ai_pump_power_map

La IA NO calcula las métricas. La base hace los cálculos y la IA interpreta.

CACHE
=====
El análisis se reutiliza durante 5 minutos para no gastar llamadas de API
cada vez que se entra a la pestaña.
El botón "Reanalizar operación" fuerza una llamada nueva.

OPENAI
======
Se usa Responses API.
Modelo por defecto:
gpt-5.6-luna

Podés cambiarlo con:
OPENAI_MODEL

Render debe tener:
OPENAI_API_KEY=<tu API key>

No pongas la API key en el frontend ni en GitHub.

BASE DE DATOS
=============
La tabla kpi.ai_operation_analyses ya fue creada directamente en Supabase
para conservar el historial de análisis.

APLICAR
=======
powershell -ExecutionPolicy Bypass -File .\Dirac_App1_IA_Gestion_Global_v18_39\APLICAR_IA_GESTION_GLOBAL_V18_39.ps1

Luego:
cd FrontEnd\App_1
npm run build

Después commit + push para desplegar backend y frontend.
