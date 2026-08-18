DIRAC SCADA - TANQUES INDUSTRIALES V10

Supabase:
- Ya se agregó public.tanks.categoria.
- Valores permitidos:
  tanque
  pozo
- Los equipos cuyo nombre contiene "pozo" fueron clasificados como pozo.
- Los demás quedaron como tanque.

Este ZIP implementa:

1. TANQUE INDUSTRIAL
- Forma cilíndrica metálica.
- Tapa y fondo elípticos.
- Agua interna.
- Nivel grande y limpio.
- Sin puntos de conexión visibles permanentemente.

2. POZO
- Visual distinto al tanque.
- Casing/brocal vertical.
- Agua interna.
- Indicador de nivel.

3. CONEXIONES
- 3 puntos a la izquierda.
- 3 puntos a la derecha.
- 3 puntos arriba.
- 3 puntos abajo.
- Solo aparecen cuando activás Editar + Conectar.
- En modo normal no hay círculos feos alrededor del tanque.
- La cañería conectada nace directamente desde el borde del tanque/pozo.

4. BACKEND
- get_layout_combined devuelve tanks.categoria.

5. FRONTEND
- categoria se copia al nodo UI.
- TankNodeView selecciona automáticamente Tanque o Pozo.

USO
1. Descomprimir en la raíz de DiracInstrumentacion.
2. Ejecutar:

   .\Dirac_SCADA_tanques_industriales_v10\APLICAR_TANQUES_INDUSTRIALES_V10.ps1

3. Luego:

   cd FrontEnd\App_2
   npm run dev

4. Para producción, subir/redeployar también Backend.
