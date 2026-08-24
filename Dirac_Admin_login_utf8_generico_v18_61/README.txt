DIRAC APP PRINCIPAL - LOGIN ADMIN UTF8 + GENERICO V18.61

Corrige textos con caracteres raros en el login de Administracion.

Tambien:
- usuario vacio al entrar;
- password vacio al entrar;
- sin usuario sugerido;
- sin password sugerida;
- autocomplete desactivado.

Credenciales reales siguen siendo:
admin / admin

Aplicar:
powershell -ExecutionPolicy Bypass -File .\Dirac_Admin_login_utf8_generico_v18_61\APLICAR_LOGIN_UTF8_GENERICO_V18_61.ps1

Luego:
cd FrontEnd\App_Principal
npm run build
