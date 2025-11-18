# KPI Widget (Embeddable)

Este paquete empaqueta tu componente de KPIs como:
1) Un componente React (`KpiWidget`)
2) Un *mount helper* (`mountKpiWidget`) para microfrontends
3) Un Web Component (`<kpi-widget>`) para hosts sin React

## Correr en local
```bash
npm i
npm run dev
# abre http://localhost:5173
```

## Build para embebido
```bash
npm run build
# genera dist/kpi-widget.es.js y kpi-widget.umd.js
```

## Cómo embeber

### a) En una app React
```tsx
import {{ KpiWidget }} from 'kpi-embed/dist/kpi-widget.es.js'

<KpiWidget title="KPIs" data={{{{ kpis:[{{label:'...', value:123}}] }}}} />
```

### b) Como microfrontend (mount)
```ts
import {{ mountKpiWidget }} from 'kpi-embed/dist/kpi-widget.es.js'

const unmount = mountKpiWidget(document.getElementById('slot')!, {{
  title: 'KPIs',
  data: {{ kpis: [{{label: 'Recaudación', value: 145000000}}] }}
}})
```

### c) Como Web Component (sin React)
```html
<script type="module" src="/dist/kpi-widget.es.js"></script>
<kpi-widget title="Tablero" data='{{"kpis":[{{"label":"Recaudación","value":145000000}}]}}'></kpi-widget>
```

## Notas
- El archivo `src/KpiContent.tsx` contiene **tu código original**, mínimamente envuelto para exportación.
- Si tu componente espera props específicas, ajústalas dentro de `KpiContent` o en `KpiWidget`.
- Puedes copiar estilos del ejemplo `infraestructura` si deseas un look & feel consistente.
