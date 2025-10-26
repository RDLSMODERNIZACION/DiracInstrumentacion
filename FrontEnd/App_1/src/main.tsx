import React from 'react'
import { createRoot } from 'react-dom/client'
import KpiWidget from "./widget";

import './index.css'


const root = createRoot(document.getElementById('root')!)
root.render(
  <React.StrictMode>
    <KpiWidget
      title="Tablero de KPIs"
      data={{
        kpis: [
          { label: 'Recaudación', value: 145000000, delta: 12.3 },
          { label: 'Gastos', value: 126000000, delta: -3.8 },
          { label: 'Órdenes', value: 5421, delta: 2.2 }
        ],
        series: [
          { name: 'Recaudación', data: [100, 130, 120, 145] },
          { name: 'Gastos', data: [95, 110, 115, 126] }
        ],
        categories: ['Ene', 'Feb', 'Mar', 'Abr']
      }}
      compact={false}
    />
  </React.StrictMode>
)
