// src/data/demo/routing.ts
import type { ValveRouting } from "./types";

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
