DIRAC SCADA - SACAR TODOS V17.2

Este parche elimina definitivamente la pestaña "Todos".

Quedan:
- Agua
- Cargaderos de agua
- Cloacas

También:
- Agua queda como pestaña inicial
- elimina cualquier condición activeServicio === "todos"

Aplicar:
.\Dirac_SCADA_sacar_todos_v17_2\APLICAR_SACAR_TODOS_V17_2.ps1

Después:
cd FrontEnd\App_2
npm run dev
