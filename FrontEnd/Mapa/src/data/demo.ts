// =========================
// TIPOS BASE
// =========================

export type AssetType = "TANK" | "PUMP" | "VALVE" | "MANIFOLD";
export type Status = "OK" | "WARN" | "ALARM" | "OFF";

export type Asset = {
  id: string;
  locationId: string; // <-- CLAVE: a qué localidad pertenece (Zone.id)
  type: AssetType;
  name: string;
  lat: number;
  lng: number;
  status: Status;
  meta: Record<string, string | number | boolean>;
};

export type EdgeType = "WATER" | "SLUDGE";

export type Edge = {
  id: string; // Asset.id
  from: string; // Asset.id
  to: string; // Asset.id
  type: EdgeType;
  path?: [number, number][];
  meta?: Record<string, string | number | boolean>;
};

/**
 * ✅ ACTUALIZADO:
 * - Mantiene alimentado_por
 * - Agrega (opcional) presión por barrio para tooltip (buena/media/mala)
 *   Podés cargar UNO de estos:
 *   - presion_bar (recomendado)
 *   - presion_kpa
 *   - presion_pct
 */
export type Barrio = {
  id: string;
  name: string;
  polygon: [number, number][];
  locationId: string;
  meta: {
    alimentado_por: string; // id de válvula (Asset.id)
    presion_bar?: number;
    presion_kpa?: number;
    presion_pct?: number;
  };
};

/**
 * ✅ ACTUALIZADO:
 * - meta puede incluir videoUrl para presentar la localidad desde el sidebar
 */
export type Zone = {
  id: string;
  name: string;
  polygon: [number, number][];
  meta?: Record<string, string | number | boolean> & {
    videoUrl?: string; // ej: https://www.youtube.com/embed/ID  o  https://.../video.mp4
  };
};

// =========================
// DESTINOS DE VÁLVULAS (routing)
// =========================

export type ValveTarget =
  | { kind: "BARRIO"; barrioId: string }
  | { kind: "LOCATION"; locationId: string }
  | { kind: "ASSET"; assetId: string };

export type ValveRouting = {
  targets?: ValveTarget[];
  note?: string;
};

// =========================
// CENTER (arranque)
// =========================
export const CENTER: [number, number] = [-37.4036, -68.9360];

// =========================
// ZONAS / LOCALIDADES
// =========================

export const zones: Zone[] = [
  {
    id: "pulmon",
    name: "pulmon",
    polygon: [
      [-37.402290687555535, -68.93566399050746],
      [-37.402126961168925, -68.93551321985785],
      [-37.402299684462726, -68.93515649331529],
      [-37.40252997254986, -68.93535779422987],
      [-37.402272773164995, -68.9356737040204],
    ],
    meta: {
      tipo: "localidad",
      // videoUrl: "https://www.youtube.com/embed/XXXXXXXX",
    },
  },

  {
    id: "planta_este",
    name: "planta_este",
    polygon: [
      [-37.379350385363686, -68.9120716375081],
      [-37.37892995363066, -68.91196978139357],
      [-37.37916939352142, -68.91118474064939],
      [-37.3796117482376, -68.9115170162435],
      [-37.379316663280875, -68.91209295303372],
    ],
    meta: {
      tipo: "localidad",
      // videoUrl: "https://www.youtube.com/embed/XXXXXXXX",
    },
  },

  {
    id: "iiitk",
    name: "iiitk",
    polygon: [
      [-37.40446234498298, -68.93768003698358],
      [-37.40423145379394, -68.93736446792713],
      [-37.40445326717674, -68.9370530347198],
      [-37.40470090274962, -68.9373696890062],
      [-37.404454611264974, -68.93768168921828],
    ],
    meta: {
      tipo: "localidad",
      // videoUrl: "https://www.youtube.com/embed/XXXXXXXX",
    },
  },

  {
    id: "tanque_1000",
    name: "tanque_1000",
    polygon: [
      [-37.399510028419826, -68.92953965095676],
      [-37.39922819455421, -68.92940264299311],
      [-37.3993257888548, -68.92906782324769],
      [-37.39961028365111, -68.92921031222632],
      [-37.39950960518791, -68.92954185870887],
    ],
    meta: {
      tipo: "localidad",
      // videoUrl: "https://www.youtube.com/embed/XXXXXXXX",
    },
  },

  {
    id: "hormigon",
    name: "hormigon",
    polygon: [
      [-37.40350891753512, -68.9352761601621],
      [-37.40329514255485, -68.93504817637469],
      [-37.4034507243591, -68.93481452987895],
      [-37.40366160094916, -68.9350494909132],
      [-37.40350012117626, -68.9352813456266],
    ],
    meta: {
      tipo: "localidad",
      // videoUrl: "https://www.youtube.com/embed/XXXXXXXX",
    },
  },

  {
    id: "planta_oeste",
    name: "planta_oeste",
    polygon: [
      [-37.37829934034054, -68.96475616347422],
      [-37.37780193909018, -68.9649036466045],
      [-37.377784807933885, -68.96449257852245],
      [-37.37822210879288, -68.96438051277939],
      [-37.378299427880044, -68.96476960711031],
    ],
    meta: {
      tipo: "localidad",
      // videoUrl: "https://www.youtube.com/embed/XXXXXXXX",
    },
  },
  {
    id: "planta_oeste_2",
    name: "planta_oeste_2",
    polygon: [
      [-37.377428339638186, -68.96298895861817],
      [-37.377177509158905, -68.96307379411262],
      [-37.37714067001772, -68.96282110030694],
      [-37.377315936370046, -68.9627133183814],
      [-37.377429034980665, -68.96299923258418],
    ],
    meta: {
      tipo: "localidad",
      // videoUrl: "https://www.youtube.com/embed/XXXXXXXX",
    },
  },
];

// =========================
// ASSETS
// =========================

export const assets: Asset[] = [
  // PULMÓN
  {
    id: "mf_pulmon",
    locationId: "pulmon",
    type: "MANIFOLD",
    name: "Manifold (Pulmón)",
    lat: -37.4023,
    lng: -68.93545,
    status: "OK",
    meta: {},
  },
  {
    id: "tk_pulmon",
    locationId: "pulmon",
    type: "TANK",
    name: "Tanque Pulmón",
    lat: -37.40215,
    lng: -68.93555,
    status: "OK",
    meta: { nivel_pct: 72, volumen_m3: 1200, autonomia_h: 6.2 },
  },
  {
    id: "pump_pulmon_1",
    locationId: "pulmon",
    type: "PUMP",
    name: "Bomba Pulmón #1",
    lat: -37.40238,
    lng: -68.93525,
    status: "OK",
    meta: { estado: "ON", hz: 45, kw: 18.1 },
  },
  {
    id: "pump_pulmon_2",
    locationId: "pulmon",
    type: "PUMP",
    name: "Bomba Pulmón #2",
    lat: -37.40245,
    lng: -68.93518,
    status: "OFF",
    meta: { estado: "OFF", hz: 0, kw: 0 },
  },
  {
    id: "valv_pulmon_salida",
    locationId: "pulmon",
    type: "VALVE",
    name: "Válvula Salida Pulmón",
    lat: -37.40232,
    lng: -68.9354,
    status: "OK",
    meta: { modo: "AUTO", posicion_pct: 70 },
  },

  // ✅ PLANTA ESTE (agrego manifold para poder conectar la cañería)
  {
    id: "mf_planta_este",
    locationId: "planta_este",
    type: "MANIFOLD",
    name: "Manifold (Planta Este)",
    lat: -37.37948144681106,
    lng: -68.91152103686728,
    status: "OK",
    meta: {},
  },

  // PLANTA OESTE
  {
    id: "mf_planta_oeste",
    locationId: "planta_oeste",
    type: "MANIFOLD",
    name: "Manifold (Planta Oeste)",
    lat: -37.3781,
    lng: -68.96466,
    status: "OK",
    meta: {},
  },
  {
    id: "pump_oeste_1",
    locationId: "planta_oeste",
    type: "PUMP",
    name: "Bomba Oeste #1",
    lat: -37.378,
    lng: -68.96482,
    status: "OK",
    meta: { estado: "ON", hz: 48, kw: 22.4 },
  },
  {
    id: "pump_oeste_2",
    locationId: "planta_oeste",
    type: "PUMP",
    name: "Bomba Oeste #2",
    lat: -37.37806,
    lng: -68.96488,
    status: "OK",
    meta: { estado: "ON", hz: 47, kw: 21.9 },
  },
  {
    id: "pump_oeste_3",
    locationId: "planta_oeste",
    type: "PUMP",
    name: "Bomba Oeste #3",
    lat: -37.37812,
    lng: -68.96494,
    status: "OFF",
    meta: { estado: "OFF", hz: 0, kw: 0 },
  },
  {
    id: "valv_oeste_10",
    locationId: "planta_oeste",
    type: "VALVE",
    name: "Válvula Salida 10”",
    lat: -37.37814,
    lng: -68.96461,
    status: "OK",
    meta: { modo: "AUTO", posicion_pct: 80, diametro_in: 10 },
  },
  {
    id: "valv_oeste_8",
    locationId: "planta_oeste",
    type: "VALVE",
    name: "Válvula Salida 8”",
    lat: -37.37816,
    lng: -68.96458,
    status: "OK",
    meta: { modo: "AUTO", posicion_pct: 75, diametro_in: 8 },
  },

  // IIITK (manifold para conectar cañería)
  {
    id: "mf_iiitk",
    locationId: "iiitk",
    type: "MANIFOLD",
    name: "Manifold (IIITK)",
    lat: -37.40435272881349,
    lng: -68.93734107352347,
    status: "OK",
    meta: {},
  },

  // OTROS
  {
    id: "valv_planta_oeste_2",
    locationId: "planta_oeste_2",
    type: "VALVE",
    name: "Válvula (Planta Oeste 2)",
    lat: -37.37729829803311,
    lng: -68.96291928080066,
    status: "OK",
    meta: { modo: "MANUAL", posicion_pct: 35 },
  },
  {
    id: "tk_1000",
    locationId: "tanque_1000",
    type: "TANK",
    name: "Tanque 1000",
    lat: -37.39943678013357,
    lng: -68.92935245762655,
    status: "WARN",
    meta: { nivel_pct: 41, volumen_m3: 1000, autonomia_h: 4.1 },
  },

  // ✅ NUEVA VÁLVULA que activa Barrio Centro (Tanque 1000)
  {
    id: "valv_tk1000_centro",
    locationId: "tanque_1000",
    type: "VALVE",
    name: "Válvula Barrio Centro",
    lat: -37.39938,
    lng: -68.92922,
    status: "OK",
    meta: { modo: "AUTO", posicion_pct: 0, funcion: "Habilita distribución a Barrio Centro" },
  },

  {
    id: "tk_hormigon",
    locationId: "planta_este",
    type: "TANK",
    name: "Hormigón (demo)",
    lat: -37.37927562880685,
    lng: -68.91176722576566,
    status: "OK",
    meta: { nivel_pct: 74, volumen_m3: 850, autonomia_h: 7.6 },
  },
  {
    id: "valv_iiitk",
    locationId: "hormigon",
    type: "VALVE",
    name: "Válvula (IIITK) (demo)",
    lat: -37.40348330131489,
    lng: -68.93509394059112,
    status: "OK",
    meta: { modo: "AUTO", posicion_pct: 68 },
  },
  {
    id: "pump_planta_este",
    locationId: "pulmon",
    type: "PUMP",
    name: "Bomba (Planta Este) (demo)",
    lat: -37.40230401578041,
    lng: -68.93547304038617,
    status: "OK",
    meta: { estado: "ON", hz: 46, kw: 18.4 },
  },
];

// =========================
// BARRIOS — con locationId
// =========================
export const barrios: Barrio[] = [
  {
    id: "b_pulmon",
    locationId: "pulmon",
    name: "Sector Pulmón",
    polygon: [
      [-37.4033, -68.9362],
      [-37.4033, -68.9348],
      [-37.402, -68.9348],
      [-37.402, -68.9362],
    ],
    meta: {
      alimentado_por: "valv_oeste_10",
      // presion_bar: 2.3,
    },
  },
  {
    id: "b_oeste",
    locationId: "planta_oeste",
    name: "Barrio Oeste",
    polygon: [
      [-37.3786, -68.9653],
      [-37.3786, -68.9641],
      [-37.3775, -68.9641],
      [-37.3775, -68.9653],
    ],
    meta: {
      alimentado_por: "valv_oeste_10",
      // presion_bar: 1.9,
    },
  },
  {
    id: "b_oeste_2",
    locationId: "planta_oeste_2",
    name: "Barrio Oeste 2",
    polygon: [
      [-37.3778, -68.9636],
      [-37.3778, -68.9625],
      [-37.3769, -68.9625],
      [-37.3769, -68.9636],
    ],
    meta: {
      alimentado_por: "valv_planta_oeste_2",
      // presion_bar: 1.4,
    },
  },

  // ✅ Barrio Centro (GeoJSON convertido a Polygon [lat,lng] y CERRADO)
  {
    id: "b_centro",
    locationId: "tanque_1000",
    name: "Barrio Centro",
    polygon: [
      [-37.3920108512506, -68.9322800763886],
      [-37.385977480336955, -68.92956544789807],
      [-37.38830927545243, -68.92079793155744],
      [-37.39335153440273, -68.92332913920342],
      [-37.39182140495886, -68.93231676055726],
      [-37.3920108512506, -68.9322800763886], // cierre
    ],
    meta: {
      alimentado_por: "valv_tk1000_centro",
      // presion_bar: 2.1,
    },
  },
];

// =========================
// EDGES (cañerías)
// =========================

// Planta Oeste -> Pulmón: 2 cañerías en paralelo (10" y 8")
const path_oeste_a_pulmon: [number, number][] = [
  [-37.37814212256104, -68.96460861253534],
  [-37.3812655880092, -68.96469502822225],
  [-37.3835986670642, -68.96479127049935],
  [-37.383225945561186, -68.96137852873905],
  [-37.385496191335065, -68.95672748732784],
  [-37.38740844593072, -68.95181606408809],
  [-37.38963885991773, -68.93810845004776],
  [-37.391693789818426, -68.93741027602559],
  [-37.396603120543325, -68.93994874929972],
  [-37.39963672334476, -68.93743222873782],
  [-37.40220088717111, -68.9367377066455],
  [-37.40277488604625, -68.93577866894671],
  [-37.40231265305935, -68.93544912606455],
];

// IIITK -> Hormigón
const path_iiitk_a_hormigon: [number, number][] = [
  [-37.40435272881349, -68.93734107352347],
  [-37.40393741245568, -68.936540993746],
  [-37.4037297534576, -68.9363746405689],
  [-37.403704582630624, -68.93604985579461],
  [-37.40369828992257, -68.9355111883643],
  [-37.40363536281374, -68.93529730570826],
  [-37.40353467932835, -68.93517848201012],
];

// Hormigón -> Tanque 1000
const path_hormigon_a_tk1000: [number, number][] = [
  [-37.403346743465896, -68.93498860786465],
  [-37.40292739823067, -68.93413518721049],
  [-37.402186549246174, -68.93332575731144],
  [-37.401543542289815, -68.9323227680453],
  [-37.40043923488332, -68.931108623197],
  [-37.39972631892621, -68.93013202842755],
  [-37.39954459416589, -68.92996486355717],
  [-37.39950265761995, -68.9294017818881],
];

// Planta Este -> Tanque 1000
const path_planta_este_a_tk1000: [number, number][] = [
  [-37.37948144681106, -68.91152103686728],
  [-37.379926952153916, -68.91125628774319],
  [-37.3805704551985, -68.91129132806816],
  [-37.38072514285665, -68.91114337948963],
  [-37.38100761966023, -68.91109022340692],
  [-37.383961571753744, -68.91247632612338],
  [-37.38443196564926, -68.91129956119684],
  [-37.388781340398, -68.91712747546936],
  [-37.391484307116436, -68.91884499789529],
  [-37.39522369065635, -68.92013314275415],
  [-37.39405647659587, -68.92691647585066],
  [-37.397912784218605, -68.9286940622481],
  [-37.39915816769504, -68.92933144643051],
  [-37.399234609420795, -68.92921116776293],
  [-37.39940023289056, -68.929299372119],
];

export const edges: Edge[] = [
  { id: "e_o1_mfo", from: "pump_oeste_1", to: "mf_planta_oeste", type: "WATER" },
  { id: "e_o2_mfo", from: "pump_oeste_2", to: "mf_planta_oeste", type: "WATER" },
  { id: "e_o3_mfo", from: "pump_oeste_3", to: "mf_planta_oeste", type: "WATER" },

  { id: "e_mfo_v10", from: "mf_planta_oeste", to: "valv_oeste_10", type: "WATER" },
  { id: "e_mfo_v8", from: "mf_planta_oeste", to: "valv_oeste_8", type: "WATER" },

  {
    id: "aq_oeste_pulmon_10",
    from: "valv_oeste_10",
    to: "mf_pulmon",
    type: "WATER",
    path: path_oeste_a_pulmon,
    meta: { name: "Acueducto 10” Oeste → Pulmón", diameter_in: 10, requiresOpen: ["valv_oeste_10"] },
  },
  {
    id: "aq_oeste_pulmon_8",
    from: "valv_oeste_8",
    to: "mf_pulmon",
    type: "WATER",
    path: path_oeste_a_pulmon,
    meta: { name: "Acueducto 8” Oeste → Pulmón", diameter_in: 8, requiresOpen: ["valv_oeste_8"] },
  },

  {
    id: "pipe_iiitk_hormigon",
    from: "mf_iiitk",
    to: "tk_hormigon",
    type: "WATER",
    path: path_iiitk_a_hormigon,
    meta: { name: "IIITK → Hormigón", diameter_in: 6, requiresOpen: ["valv_iiitk"] },
  },

  {
    id: "pipe_hormigon_tk1000",
    from: "tk_hormigon",
    to: "tk_1000",
    type: "WATER",
    path: path_hormigon_a_tk1000,
    meta: { name: "Hormigón → Tanque 1000", diameter_in: 6 },
  },

  {
    id: "pipe_planta_este_tk1000",
    from: "mf_planta_este",
    to: "tk_1000",
    type: "WATER",
    path: path_planta_este_a_tk1000,
    meta: { name: "Planta Este → Tanque 1000", diameter_in: 6 },
  },
];

// =========================
// ROUTING (destinos de válvulas)
// =========================
export const valveRouting: Record<string, ValveRouting> = {
  valv_oeste_10: {
    targets: [
      { kind: "LOCATION", locationId: "pulmon" },
      { kind: "ASSET", assetId: "mf_pulmon" },
    ],
    note: "Habilita envío por acueducto 10” hacia Pulmón",
  },

  valv_oeste_8: {
    targets: [
      { kind: "LOCATION", locationId: "pulmon" },
      { kind: "ASSET", assetId: "mf_pulmon" },
    ],
    note: "Habilita envío por acueducto 8” hacia Pulmón",
  },

  valv_iiitk: {
    targets: [
      { kind: "LOCATION", locationId: "hormigon" },
      { kind: "ASSET", assetId: "tk_hormigon" },
    ],
    note: "Habilita envío desde IIITK hacia Hormigón",
  },

  valv_planta_oeste_2: {
    targets: [{ kind: "BARRIO", barrioId: "b_oeste_2" }],
    note: "Distribución sector Planta Oeste 2",
  },

  valv_tk1000_centro: {
    targets: [{ kind: "BARRIO", barrioId: "b_centro" }],
    note: "Habilita distribución hacia Barrio Centro (desde Tanque 1000)",
  },
};
