# Demo GIS/SCADA · Distribución de Agua (Leaflet) — Impactante (100% harcodeado)

Esto es una demo **para venta**:
- Zonas seleccionables
- Lista de válvulas dentro de la zona
- Switch ON/OFF (simulado) con impacto visual
- Rutas activas (highlight) cuando seleccionás válvulas
- KPIs simulados (presión/caudal)
- Modo Presentación (auto-recorrido)
- Exportar a imagen (PNG) con un click

## Requisitos
- Node.js 18+ (ideal 20+)

## Correr
```bash
npm install
npm run dev
```
Abrí: http://localhost:5173

## Editar polígonos / assets / ruteo
- `src/data/demo.ts`

### Importar GeoJSON
- GeoJSON usa coordenadas `[lng, lat]`
- Esta app usa `[lat, lng]`
- Para zonas rellenas, usá **Polygon** (o un anillo cerrado)

## Consejo de venta
En una reunión:
1) Apretá **Modo demo**
2) Mostrá cómo al cerrar una válvula se apagan barrios/rutas
3) Exportá una imagen y mandala al cliente
