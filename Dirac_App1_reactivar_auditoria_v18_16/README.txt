DIRAC APP 1 - REACTIVAR AUDITORÍA V18.16

El V18.15 fallaba porque buscaba Auditoría en el archivo local,
pero V18.14 ya la había desactivado/eliminado de la vista actual.

V18.16 la recupera directamente desde:
git HEAD:FrontEnd/App_1/src/widget/index.tsx

Luego la inserta debajo del nuevo resumen operativo.

CONSERVA:
- gráfico de Impulsión
- gráfico de Distribución
- detalle bombas por localidad
- detalle tanques por localidad

RECUPERA:
- Auditoría comparativa
- Comparación directa cuando se activa

NO RECUPERA:
- Eventos operativos recientes
- Resumen por ubicación

Aplicar:
powershell -ExecutionPolicy Bypass -File .\Dirac_App1_reactivar_auditoria_v18_16\APLICAR_REACTIVAR_AUDITORIA_V18_16.ps1

Después:
cd FrontEnd\App_1
npm run dev
