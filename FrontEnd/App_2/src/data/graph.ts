// src/data/graph.ts
import { computeAutoLayout } from '@/layout/auto'

// Tipos
export type NodeType = 'tank' | 'pump' | 'valve' | 'manifold'

export type NodeBase = {
  id: string; type: NodeType; name: string; x: number; y: number;
  level?: number; capacity?: number;                         // tanks
  status?: 'on' | 'standby' | 'fault' | 'unknown'; kW?: number; // pumps
  state?: 'open' | 'closed' | 'throttle';                    // valves
}

// (Opcional) podés forzar x/y manual en algún nodo; si no, el auto-layout lo posiciona.
export const BASE_NODES: Array<Omit<NodeBase, 'x' | 'y'> & Partial<Pick<NodeBase, 'x' | 'y'>>> = [
  // Tanques altos
  { id: 'TA1', type: 'tank', name: 'Tanque Alto 1', level: 0.42, capacity: 600 },
  { id: 'TA2', type: 'tank', name: 'Tanque Alto 2', level: 0.33, capacity: 550 },
  { id: 'TA3', type: 'tank', name: 'Tanque Alto 3', level: 0.37, capacity: 520 },

  // Tanques principales
  { id: 'TP', type: 'tank', name: 'Tanque Pulmón', level: 0.55, capacity: 1500 },
  { id: 'TA', type: 'tank', name: 'Tanque Almacén', level: 0.68, capacity: 1800 },

  // Gravedad destino
  { id: 'TG', type: 'tank', name: 'Tanque Gravedad', level: 0.61, capacity: 700 },

  // Planta: 7 bombas
  { id: 'P1', type: 'pump', name: 'Bomba P1', status: 'on', kW: 22 },
  { id: 'P2', type: 'pump', name: 'Bomba P2', status: 'on', kW: 22 },
  { id: 'P3', type: 'pump', name: 'Bomba P3', status: 'standby', kW: 22 },
  { id: 'P4', type: 'pump', name: 'Bomba P4', status: 'on', kW: 22 },
  { id: 'P5', type: 'pump', name: 'Bomba P5', status: 'standby', kW: 22 },
  { id: 'P6', type: 'pump', name: 'Bomba P6', status: 'on', kW: 22 },
  { id: 'P7', type: 'pump', name: 'Bomba P7', status: 'fault', kW: 22 },

  // Colectoras de planta
  { id: 'MC',  type: 'manifold', name: 'Colectora Planta' },
  { id: 'M8',  type: 'manifold', name: 'Colectora Ø8"' },
  { id: 'M10', type: 'manifold', name: 'Colectora Ø10"' },

  // Válvulas de salida de planta
  { id: 'V8',  type: 'valve', name: 'V-Ø8',  state: 'open' },
  { id: 'V10', type: 'valve', name: 'V-Ø10', state: 'open' },

  // Bombas del Pulmón
  { id: 'P8', type: 'pump', name: 'Bomba P8 (Pulmón)', status: 'on', kW: 18 },
  { id: 'P9', type: 'pump', name: 'Bomba P9 (Pulmón)', status: 'standby', kW: 18 },

  // Colectora del Pulmón (une P8/P9 antes de ir a VTAx)
  { id: 'MB', type: 'manifold', name: 'Colectora Pulmón' },

  // Válvulas a tanques altos
  { id: 'VTA1', type: 'valve', name: 'V-TA1', state: 'open' },
  { id: 'VTA2', type: 'valve', name: 'V-TA2', state: 'open' },
  { id: 'VTA3', type: 'valve', name: 'V-TA3', state: 'throttle' },

  // Gravedad
  { id: 'VG', type: 'valve', name: 'V-Gravedad', state: 'open' },

  // --- NUEVO: Planta Este (3 bombas) + su colectora -> TG ---
  { id: 'P10', type: 'pump', name: 'Bomba P10 (Planta Este)', status: 'on', kW: 18 },
  { id: 'P11', type: 'pump', name: 'Bomba P11 (Planta Este)', status: 'standby', kW: 18 },
  { id: 'P12', type: 'pump', name: 'Bomba P12 (Planta Este)', status: 'standby', kW: 18 },
  { id: 'ME',  type: 'manifold', name: 'Colectora Planta Este' },

  // --- NUEVO: Colectora de tanques altos -> bomba dedicada ---
  { id: 'MTAH', type: 'manifold', name: 'Colectora Tanques Altos' },
  { id: 'PB',   type: 'pump',     name: 'Bomba Colectora Altos', status: 'standby', kW: 15 },
]

// ¡Aquí se calcula todo el layout!
export const NODES: NodeBase[] = computeAutoLayout(BASE_NODES)

// ------ Aristas y escenarios ------

// ✅ Definí el tipo de caño una vez
export type Pipe = '8' | '10' | 'G'

// ✅ La tercera posición de la tupla es OPCIONAL (sin null/undefined raro)
export type EdgeDef = [string, string, Pipe?]

export const EDGES_BASE: EdgeDef[] = [
  // Planta -> colectora
  ['P1','MC'], ['P2','MC'], ['P3','MC'], ['P4','MC'], ['P5','MC'], ['P6','MC'], ['P7','MC'],

  // Colectora -> ramales
  ['MC','M8','8'],
  ['MC','M10','10'],

  // Ramales -> válvulas de salida
  ['M8','V8','8'],
  ['M10','V10','10'],

  // Válvulas -> tanques principales
  ['V8','TP','8'],
  ['V10','TA','10'],

  // Pulmón -> bombas booster -> colectora -> VTAx
  ['TP','P8'], ['TP','P9'],
  ['P8','MB'], ['P9','MB'],
  ['MB','VTA1'], ['MB','VTA2'], ['MB','VTA3'],
  ['VTA1','TA1'], ['VTA2','TA2'], ['VTA3','TA3'],

  // Gravedad desde Almacén
  ['TA','VG','G'],
  ['VG','TG','G'],

  // --- NUEVO: Planta Este (3 bombas) -> colectora -> TG ---
  ['P10','ME'], ['P11','ME'], ['P12','ME'],
  ['ME','TG','10'],

  // --- NUEVO: Colectora de tanques altos -> bomba dedicada ---
  ['TA1','MTAH'], ['TA2','MTAH'], ['TA3','MTAH'],
  ['MTAH','PB'],
]

// Escenarios con claves <A>B como "A>B"
export const SCENARIOS = {
  Normal: {
    active: [
      'MC>M8','M8>V8','V8>TP',
      'MC>M10','M10>V10','V10>TA',
      'TP>P8','P8>MB','MB>VTA1','MB>VTA2','MB>VTA3',
      'VTA1>TA1','VTA2>TA2','VTA3>TA3',
      'TA>VG','VG>TG',
      'P10>ME','ME>TG',
      // 'TA1>MTAH','TA2>MTAH','TA3>MTAH','MTAH>PB',
    ],
    note: 'Ø8→Pulmón, Ø10→Almacén. P8 impulsa a VTA1/2/3. P10 apoya a TG.',
  },
  'Pulmón dual': {
    active: [
      'MC>M8','M8>V8','V8>TP',
      'MC>M10','M10>V10','V10>TA',
      'TP>P8','TP>P9','P8>MB','P9>MB',
      'MB>VTA1','MB>VTA2','MB>VTA3',
      'VTA1>TA1','VTA2>TA2','VTA3>TA3',
      'TA>VG','VG>TG',
      'P10>ME','ME>TG',
    ],
    note: 'P8 y P9 alimentan colectora; Planta Este apoya TG.',
  },
  'Sólo Ø8': {
    active: [
      'MC>M8','M8>V8','V8>TP',
      'TP>P8','P8>MB','MB>VTA1','MB>VTA2','MB>VTA3',
      'VTA1>TA1','VTA2>TA2','VTA3>TA3',
      'P10>ME','ME>TG',
    ],
    note: 'Ø10 fuera; Pulmón con P8 → VTA1/2/3. TG con Planta Este.',
  },
  'Sólo Ø10': {
    active: ['MC>M10','M10>V10','V10>TA','TA>VG','VG>TG','P10>ME','ME>TG'],
    note: 'Ø8 fuera; Almacén y Planta Este sostienen.',
  },
  Emergencia: {
    active: [
      'MC>M8','M8>V8','V8>TP',
      'TP>P9','P9>MB','MB>VTA3','VTA3>TA3',
      'MC>M10','M10>V10','V10>TA',
      'P10>ME','ME>TG',
    ],
    note: 'Falla P8: P9 prioriza TA3. Ø10 sostiene Almacén. Planta Este mantiene TG.',
  }
} as const

export const NODES_LIST: NodeBase[] = NODES
export const byId: Record<string, NodeBase> =
  Object.fromEntries(NODES.map(n => [n.id, n])) as any
