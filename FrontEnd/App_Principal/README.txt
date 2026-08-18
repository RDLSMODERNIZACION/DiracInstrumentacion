WEB PRINCIPAL -> PROXY /admin

Este parche se aplica en el proyecto que sirve:
www.diracserviciosenergia.com

Repo:
RDLSMODERNIZACION/DiracInstrumentacion
carpeta:
FrontEnd/App_Principal

Ejemplo:

.\APLICAR.ps1 -AdminUrl "https://TU-PROYECTO-ADMIN.vercel.app"

Crea vercel.json con:
 /admin        -> admin Vercel /admin
 /admin/:path* -> admin Vercel /admin/:path*

Después:
git add .
git commit -m "Publicar admin bajo dominio principal"
git push

IMPORTANTE:
Usá la URL de producción del proyecto admin en Vercel, no una URL de preview con hash.
