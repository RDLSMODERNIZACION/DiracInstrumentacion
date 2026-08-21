DIRAC APP 1 - AUDITORÍA SOLO EN OPERACIÓN V18.17

Corrige:
La Auditoría comparativa aparecía también en otras pestañas.

Resultado:
- Operación: SÍ muestra Auditoría comparativa
- Eficiencia energética: NO
- Operación y confiabilidad: NO
- Proceso y calidad del agua: NO
- Gestión global: NO

Aplicar:
powershell -ExecutionPolicy Bypass -File .\Dirac_App1_auditoria_solo_operacion_v18_17\APLICAR_AUDITORIA_SOLO_OPERACION_V18_17.ps1

Después:
cd FrontEnd\App_1
npm run dev
