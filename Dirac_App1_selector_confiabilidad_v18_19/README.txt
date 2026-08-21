DIRAC APP 1 - SELECTOR CONFIABILIDAD V18.19

El V18.18 fallaba porque buscaba el bloque completo de ReliabilityPage y
el archivo local ya había cambiado por los parches anteriores.

V18.19 es más seguro:
- NO reemplaza el bloque de confiabilidad
- localiza únicamente:
  {tab === "confiabilidad" && (
- inserta antes un selector de Ubicación condicionado a la misma pestaña
- reutiliza loc / setLoc / locOptionsAll

Resultado:
Operación y confiabilidad tiene un selector propio.
Las demás pestañas no muestran ese selector.

Aplicar:
powershell -ExecutionPolicy Bypass -File .\Dirac_App1_selector_confiabilidad_v18_19\APLICAR_SELECTOR_CONFIABILIDAD_V18_19.ps1

Después:
cd FrontEnd\App_1
npm run dev
