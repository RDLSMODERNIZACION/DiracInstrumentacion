DIRAC - ADMINISTRACION DESDE EL MENU V18.56

Problema real encontrado:
1. App_Principal bloqueaba Administracion antes de cargarla:
   if (!canSeeAdmin) return ownerOnlyBanner;

2. App_Principal esperaba /admin/, pero build-embedded.mjs NO compilaba ni copiaba
   FrontEnd/Administracion a public/admin.

3. En desarrollo ScadaApp apuntaba por defecto a puerto 5176,
   pero FrontEnd/Administracion/vite.config.ts usa 5178.

V18.56 corrige los 3 puntos.

Flujo final:
App_Principal
  -> Administracion
     -> /admin/
        -> FrontEnd/Administracion
           -> Login propio
              -> panel administrativo

Aplicar:
powershell -ExecutionPolicy Bypass -File .\Dirac_Administracion_desde_menu_v18_56\APLICAR_ADMIN_DESDE_MENU_V18_56.ps1

Build:
cd FrontEnd\App_Principal
npm run build

El prebuild de App_Principal construye:
- App_1 -> /kpi/
- App_2 -> /infraestructura/
- Administracion -> /admin/
- Mapa -> /mapa/

Luego commit + push.
