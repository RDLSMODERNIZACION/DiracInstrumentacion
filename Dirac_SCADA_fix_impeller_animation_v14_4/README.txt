DIRAC SCADA - FIX IMPELLER V14.4

CAUSA REAL

El problema no era solamente el tamaño de las aspas.

El SVG tenía:

<g transform="translate(43 5)">
   ...
   <animateTransform attributeName="transform" type="rotate" ... />
</g>

animateTransform anima/reemplaza el atributo transform del MISMO grupo.
Durante la animación se pierde translate(43 5), por eso el rotor se desplaza
y aparece fuera del círculo.

SOLUCIÓN

Ahora queda:

<g transform="translate(43 5)">
   <g>
      aspas
      <animateTransform type="rotate" ... />
   </g>
</g>

El grupo exterior conserva siempre la posición.
El grupo interior gira sobre 0,0.

También se redujo levemente el tamaño de las aspas.

Se aplica a:
- bomba horizontal
- bomba vertical

No toca:
- Supabase
- pump pipe taps
- InfraDiagram
- EditableEdge

APLICAR:

.\Dirac_SCADA_fix_impeller_animation_v14_4\APLICAR_FIX_IMPELLER_V14_4.ps1

Después:

cd FrontEnd\App_2
npm run dev
