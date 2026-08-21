DIRAC APP 1 - SACAR SELECTORES V18.12

Quita de la pantalla principal de Operación:
- selector Ubicación
- bloque selector de Tanques
- bloque selector de Bombas
- badges 24 h / bucket / actualizado de la franja superior

Conserva:
- Tabs
- gráficos de Impulsión y Distribución
- detalle por localidad
- filtros internos y lógica de datos (solo deja de mostrarlos)

Aplicar:
powershell -ExecutionPolicy Bypass -File .\Dirac_App1_sacar_selectores_v18_12\APLICAR_SACAR_SELECTORES_V18_12.ps1

Después:
cd FrontEnd\App_1
npm run dev
