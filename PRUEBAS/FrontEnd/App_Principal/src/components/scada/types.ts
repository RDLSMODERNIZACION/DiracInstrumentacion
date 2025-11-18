// src/components/scada/types.ts
export type Role = "operador" | "supervisor" | "mantenimiento" | "admin";

export type Company = {
  id: string;   // ej: "acme"
  name: string; // ej: "ACME S.A."
};

export type User = {
  id: string;
  name: string;     // nombre visible
  role: Role;
  company?: Company; // hacerlo opcional por si no cargás empresa
};
