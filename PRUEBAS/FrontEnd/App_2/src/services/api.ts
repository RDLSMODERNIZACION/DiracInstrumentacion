// src/services/api.ts
import axios from "axios";
export const API_BASE =
  import.meta.env.VITE_API_BASE?.replace(/\/+$/, "") || "";

export const api = axios.create({
  baseURL: API_BASE,
  // withCredentials: true, // activalo si tu auth es por cookie
});

import { getCompanyIdFromURL } from "@/lib/scope";

// Endpoints que NO queremos scopear (opcional)
const EXCLUDE_PREFIXES = [
  "/auth/login",
  "/auth/logout",
  "/dirac/me",
  // agregá otros si hace falta
];

// Interceptor: agrega company_id como query param si falta
api.interceptors.request.use((config) => {
  try {
    const cid = getCompanyIdFromURL();
    if (!cid) return config;

    const url = config.url || "";
    // Evitar scope en endpoints excluidos
    if (EXCLUDE_PREFIXES.some((p) => url.startsWith(p))) return config;

    // Si ya viene en params o en la URL, no agregamos
    const hasInParams = !!(config.params && Object.prototype.hasOwnProperty.call(config.params, "company_id"));
    const hasInUrl = /\bcompany_id=/.test(url);
    if (hasInParams || hasInUrl) return config;

    // Agregarlo vía params (más limpio y sin duplicados)
    config.params = { ...(config.params || {}), company_id: cid };
  } catch {
    // ignorar
  }
  return config;
});
