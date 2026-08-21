DIRAC BACKEND - CORS LOCAL V18.27

Problema observado:
App_1 local (http://localhost:5174) recibe:
No 'Access-Control-Allow-Origin' header
Failed to fetch

Los warnings de React Router NO son el problema.

V18.27:
- habilita explícitamente localhost:5173 y localhost:5174
- habilita 127.0.0.1
- habilita diracserviciosenergia.com
- habilita previews *.vercel.app
- permite headers/métodos
- agrega un exception handler global para que un error backend 500
  se vea como JSON y no se oculte detrás de un falso error CORS

Aplicar:
powershell -ExecutionPolicy Bypass -File .\Dirac_backend_cors_local_v18_27\APLICAR_CORS_LOCAL_V18_27.ps1

Luego:
git add Backend/app/main.py
git commit -m "fix cors for local reliability dashboard"
git push

Esperar redeploy de Render y recargar App_1.
