DIRAC APP 1 - FIX UTF-8 ROBUSTO V18.41

El V18.40 podia romperse porque el propio archivo PS1 contenia caracteres mojibake.

V18.41 evita ese problema:
- el PS1 esta escrito solo con caracteres ASCII;
- detecta mojibake por codigos Unicode;
- intenta reparar linea por linea convirtiendo Windows-1252 -> UTF-8;
- solo acepta el cambio si reduce los caracteres sospechosos;
- guarda todo como UTF-8 sin BOM;
- no toca node_modules, dist ni .next;
- no cambia logica ni calculos.

Aplicar desde la raiz:
powershell -ExecutionPolicy Bypass -File .\Dirac_App1_fix_utf8_robusto_v18_41\APLICAR_FIX_UTF8_ROBUSTO_V18_41.ps1

Luego:
cd FrontEnd\App_1
npm run build
