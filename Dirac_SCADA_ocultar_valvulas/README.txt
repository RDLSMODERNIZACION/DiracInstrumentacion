DIRAC SCADA - OCULTAR VALVULAS

Este paquete:
- Oculta todos los nodos tipo valve del sinóptico.
- Oculta las cañerías que conectan directamente a válvulas.
- No borra válvulas de Supabase.
- No modifica posiciones.
- No elimina ValveNodeView.tsx.

USO:
1. Descomprimir la carpeta Dirac_SCADA_ocultar_valvulas dentro de la raíz de DiracInstrumentacion.
2. En PowerShell, parado en la raíz del repo:

   .\Dirac_SCADA_ocultar_valvulas\OCULTAR_VALVULAS.ps1

3. Luego:
   cd FrontEnd\App_2
   npm run dev

Si querés recuperar las válvulas, revertí InfraDiagram.tsx con Git.
