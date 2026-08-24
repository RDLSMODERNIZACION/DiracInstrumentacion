DIRAC - LOGIN ADMIN EN APP PRINCIPAL V18.59

Objetivo exacto:
- El login admin/admin aparece DENTRO de App_Principal.
- Solo despues de credenciales correctas se navega a /admin/.
- Administracion abre en pantalla completa.
- No se ve la sidebar de App_Principal dentro de Administracion.
- No hay segundo login.

Credenciales:
usuario: admin
clave: admin

Flujo:
App_Principal
  -> Administracion
     -> login admin/admin EN App_Principal
        -> correcto
           -> sessionStorage handoff de una sola vez
           -> /admin/
           -> panel de Administracion completo

Si alguien entra directo a /admin/ sin handoff, FrontEnd/Administracion muestra su login.

Aplicar:
powershell -ExecutionPolicy Bypass -File .\Dirac_Admin_login_en_principal_v18_59\APLICAR_ADMIN_LOGIN_EN_PRINCIPAL_V18_59.ps1

Build:
cd FrontEnd\Administracion
npm run build

cd ..\App_Principal
npm run build

Luego commit + push.
