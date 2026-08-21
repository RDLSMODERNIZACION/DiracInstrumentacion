DIRAC SCADA - FIX EDITABLE EDGE V14.1

Corrige el error:
Missing semicolon en EditableEdge.tsx alrededor de la línea 675.

La causa fue un bloque JSX mal cerrado del highlight celeste de Pump Pipe Tap.

Este fix:
- reconstruye completo el bloque tapConnectMode
- deja un JSX válido
- conserva la franja celeste clickeable
- conserva onTapPipeClick
- no toca Supabase
- no toca InfraDiagram

Aplicar desde la raíz:

.\Dirac_SCADA_fix_editable_edge_v14_1\APLICAR_FIX_EDITABLE_EDGE_V14_1.ps1

Después:

cd FrontEnd\App_2
npm run dev
