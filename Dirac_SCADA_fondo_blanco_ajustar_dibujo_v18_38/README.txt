DIRAC SCADA - FONDO LIMPIO + DIBUJO COMPLETO V18.38

Objetivo
========
Que el diagrama no se vea como un rectángulo gris dentro de la página
y que al abrirlo se vea todo el esquema completo.

Cambios
=======
- fondo del SVG: blanco
- grilla casi imperceptible
- elimina borde del contenedor
- elimina redondeo del panel
- initialScale: 3.35 -> 1
- minScale: 0.6 -> 0.35
- padding del viewBox: 120 -> 240
- SVG y TransformComponent ocupan 100% del área

Resultado esperado
==================
El esquema completo debe entrar en pantalla al cargar, sin recortes,
y el fondo debe integrarse con el fondo blanco general.

Aplicar
=======
powershell -ExecutionPolicy Bypass -File .\Dirac_SCADA_fondo_blanco_ajustar_dibujo_v18_38\APLICAR_FONDO_Y_AJUSTE_V18_38.ps1

Después
=======
cd FrontEnd\App_2
npm run dev
