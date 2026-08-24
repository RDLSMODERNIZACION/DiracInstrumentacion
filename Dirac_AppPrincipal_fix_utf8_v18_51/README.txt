DIRAC APP PRINCIPAL - FIX UTF-8 V18.51

Corrige mojibake en FrontEnd/App_Principal, como textos de Ubicacion
mal codificados y separadores rotos entre cantidades.

El script:
- esta escrito solo en ASCII;
- recorre archivos fuente de App_Principal;
- no toca node_modules ni dist;
- intenta reconstruir UTF-8 desde Windows-1252;
- solo acepta un cambio si reduce caracteres sospechosos;
- guarda como UTF-8 sin BOM;
- asegura meta charset UTF-8.

No modifica logica ni datos.

Aplicar:
powershell -ExecutionPolicy Bypass -File .\Dirac_AppPrincipal_fix_utf8_v18_51\APLICAR_FIX_UTF8_APP_PRINCIPAL_V18_51.ps1

Luego:
cd FrontEnd\App_Principal
npm run build
