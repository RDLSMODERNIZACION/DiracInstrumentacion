DIRAC ADMINISTRACION - LOGIN admin/admin V18.57

Credenciales:
Usuario: admin
Clave: admin

La sesion de Administracion es independiente de App_Principal.

Este parche modifica:
- FrontEnd/Administracion/src/lib/auth.tsx
- FrontEnd/Administracion/src/pages/Login.tsx

Aplicar:
powershell -ExecutionPolicy Bypass -File .\Dirac_Administracion_admin_admin_v18_57\APLICAR_ADMIN_ADMIN_V18_57.ps1

Probar:
cd FrontEnd\Administracion
npm run build

Luego:
cd ..\App_Principal
npm run build

NOTA:
Esta credencial es intencionalmente simple. Para un entorno expuesto a Internet,
conviene reemplazarla luego por autenticacion de backend real.
