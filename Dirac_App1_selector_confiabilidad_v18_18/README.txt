DIRAC APP 1 - SELECTOR ÚNICO EN OPERACIÓN Y CONFIABILIDAD V18.18

Objetivo:
al sacar el selector global, Operación y confiabilidad quedó sin filtro.

V18.18 agrega UN SOLO selector de Ubicación únicamente dentro de esa pestaña.

Resultado:
- Operación: sin selector global
- Eficiencia energética: sin selector
- Operación y confiabilidad: selector propio de Ubicación
- Proceso y calidad del agua: sin selector
- Gestión global: sin selector

El selector reutiliza:
- loc
- setLoc
- locOptionsAll

y por eso actualiza ReliabilityPage con la localidad elegida.

Aplicar:
powershell -ExecutionPolicy Bypass -File .\Dirac_App1_selector_confiabilidad_v18_18\APLICAR_SELECTOR_CONFIABILIDAD_V18_18.ps1

Después:
cd FrontEnd\App_1
npm run dev
