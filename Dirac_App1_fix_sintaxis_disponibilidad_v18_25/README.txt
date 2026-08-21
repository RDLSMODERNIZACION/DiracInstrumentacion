DIRAC APP1 - FIX SINTAXIS DISPONIBILIDAD V18.25

Corrige el error:
Unexpected token, expected "," al final de WaterNetworkOverviewLive.tsx.

Causa:
V18.24 dejó el primer useEffect sin cerrar con:
}, []);

Este paquete reemplaza el componente por la versión corregida.

Aplicar:
powershell -ExecutionPolicy Bypass -File .\Dirac_App1_fix_sintaxis_disponibilidad_v18_25\APLICAR_FIX_SINTAXIS_V18_25.ps1

Después:
cd FrontEnd\App_1
npm run dev
