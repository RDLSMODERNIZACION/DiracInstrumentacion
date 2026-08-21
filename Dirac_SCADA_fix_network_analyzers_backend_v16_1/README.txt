DIRAC SCADA - FIX NETWORK ANALYZERS BACKEND V16.1

Problema detectado:
- GET /infraestructura/get_layout_combined sin company_id no devolvía analizadores
  porque dependía de v_layout_combined.
- GET con ?company_id=1 devolvía 500.

Corrección:
1. Sin company_id:
   - mantiene v_layout_combined para nodos normales
   - agrega network_analyzers explícitamente con UNION ALL

2. Con company_id:
   - consulta network_analyzers directamente
   - LEFT JOIN layout_network_analyzers
   - COALESCE(node_id, 'network_analyzer:' || id)
   - evita depender de que el layout tenga node_id perfecto

Aplicar desde la raíz:
.\Dirac_SCADA_fix_network_analyzers_backend_v16_1\APLICAR_FIX_NETWORK_ANALYZERS_BACKEND_V16_1.ps1

Después:
- reiniciar/redeployar backend en Render

Probar:
Invoke-RestMethod "https://diracinstrumentacion.onrender.com/infraestructura/get_layout_combined" |
  Where-Object { $_.type -eq "network_analyzer" }

y:

Invoke-RestMethod "https://diracinstrumentacion.onrender.com/infraestructura/get_layout_combined?company_id=1" |
  Where-Object { $_.type -eq "network_analyzer" }
