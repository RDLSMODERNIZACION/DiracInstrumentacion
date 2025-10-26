// src/services/api.ts
import axios from "axios";

export const API_BASE =
  import.meta.env.VITE_API_BASE?.replace(/\/+$/, "") || "";

export const api = axios.create({
  baseURL: API_BASE,
  // withCredentials: true, // si algún día necesitás cookies
});
