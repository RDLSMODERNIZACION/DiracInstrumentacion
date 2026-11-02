Acceso directo a instrumentación: `/instrumentacionlogin`.
La ruta `/login` redirige al nuevo acceso para conservar enlaces anteriores.
Si ya hay una sesión iniciada, ambos accesos llevan al panel.
Vercel sirve estas rutas desde `index.html` para permitir enlaces directos y recargas.

Scada/
  App_Principal/
    src/
    public/
      kpi/               # (copiado en build)
      infraestructura/   # (copiado en build)
    scripts/
      build-embedded.mjs
    package.json
    vite.config.ts
    vercel.json
  App_1/                 # KPIs (base '/kpi/' en prod)
    package.json
    vite.config.ts
  App_2/                 # Infraestructura (base '/infraestructura/' en prod)
    package.json
    vite.config.ts
