DIRAC - ADMINISTRACION FULLSCREEN + LOGIN OBLIGATORIO V18.58

Corrige dos problemas:

1) Administracion estaba embebida dentro de App_Principal, por eso seguia visible
   la sidebar de Operaciones/KPIs/Infraestructura.

2) El login administrativo se persistia en sessionStorage y en produccion podia
   entrar sin volver a pedir autenticacion.

Resultado:
- Al tocar Administracion se navega directamente a /admin/.
- App_Principal desaparece completamente.
- FrontEnd/Administracion ocupa toda la pantalla.
- Antes de navegar se borra dirac.basic.
- Administracion ya no recupera sesion previa al cargar.
- Al entrar o refrescar pide login nuevamente.
- Credenciales configuradas previamente:
    usuario: admin
    clave: admin

Aplicar:
powershell -ExecutionPolicy Bypass -File .\Dirac_Administracion_fullscreen_auth_v18_58\APLICAR_ADMIN_FULLSCREEN_AUTH_V18_58.ps1

Build:
cd FrontEnd\Administracion
npm run build

cd ..\App_Principal
npm run build

Luego commit + push.
