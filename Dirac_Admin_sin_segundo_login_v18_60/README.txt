DIRAC - ADMINISTRACION SIN SEGUNDO LOGIN V18.60

Objetivo:
usar solamente el login admin/admin que ya esta dentro de App_Principal.

Flujo:
App_Principal
  -> Administracion
     -> login admin/admin
        -> /admin/
           -> panel administrativo directo

Este parche elimina el gate de Login.tsx en:
FrontEnd/Administracion/src/pages/App.tsx

No elimina Login.tsx del proyecto, solo deja de usarlo.

Aplicar:
powershell -ExecutionPolicy Bypass -File .\Dirac_Admin_sin_segundo_login_v18_60\APLICAR_SIN_SEGUNDO_LOGIN_V18_60.ps1

Luego:
cd FrontEnd\Administracion
npm run build

cd ..\App_Principal
npm run build

Despues commit + push.
