// src/data/demo/barrios.ts
import type { Barrio } from "./types";

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
    meta: { alimentado_por: "valv_oeste_10" },
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
    meta: { alimentado_por: "valv_oeste_10" },
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
    meta: { alimentado_por: "valv_planta_oeste_2" },
  },
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
    meta: { alimentado_por: "valv_tk1000_centro" },
  },
];
