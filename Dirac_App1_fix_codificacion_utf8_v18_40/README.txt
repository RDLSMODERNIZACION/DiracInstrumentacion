Corrige caracteres raros/mojibake en FrontEnd/App_1 y fuerza UTF-8.
Aplicar:
powershell -ExecutionPolicy Bypass -File .\Dirac_App1_fix_codificacion_utf8_v18_40\APLICAR_FIX_UTF8_KPI_V18_40.ps1
Luego:
cd FrontEnd\App_1
npm run build
