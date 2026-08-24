DIRAC - ADMINISTRACION CON LOGIN SEPARADO V18.55

Situacion actual:
App_Principal bloqueaba Administracion segun el rol del login principal y mostraba:
"No tenes permisos suficientes para acceder a Administracion."

Pero FrontEnd/Administracion YA tiene su propio Login.tsx y AuthProvider.

V18.55 cambia el flujo:

APP PRINCIPAL
  -> Administracion
     -> carga /admin/
        -> Login propio de Administracion
           -> valida /dirac/me
              -> permite superadmin o role owner/admin

Cambios:
- App_Principal deja de bloquear la pestaña Administracion.
- Administracion mantiene una sesion separada en sessionStorage con key dirac.basic.
- El login Admin verifica permisos reales.
- Se eliminan las credenciales precargadas del formulario.
- Vite Administracion usa base /admin/ en produccion.

Aplica:
powershell -ExecutionPolicy Bypass -File .\Dirac_Administracion_login_separado_v18_55\APLICAR_ADMIN_LOGIN_SEPARADO_V18_55.ps1

Probar:
cd FrontEnd\Administracion
npm run build

cd ..\App_Principal
npm run build

Luego commit + push.
