// src/data/demo/edges.ts
import type { Edge } from "./types";
import {
  path_oeste_a_pulmon,
  path_iiitk_a_hormigon,
  path_hormigon_a_tk1000,
  path_planta_este_a_tk1000,
} from "./paths";

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
