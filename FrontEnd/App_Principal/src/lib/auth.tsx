import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

type AuthState = {
  email: string | null;
  basicToken: string | null; // "Basic <b64(email:password)>"
};

type AuthContextType = {
  isAuthenticated: boolean;
  email: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  getAuthHeader: () => Record<string, string>;
};

const AuthContext = createContext<AuthContextType | null>(null);
const STORAGE_KEY = "dirac.basic";

function buildBasicToken(email: string, password: string) {
  const b64 = btoa(`${email}:${password}`);
  return `Basic ${b64}`;
}

function getApiBase() {
  // 1) Vite env si está seteado en Vercel
  const env = (import.meta as any)?.env?.VITE_API_BASE?.trim?.();
  if (env) return env;
  // 2) Flag global opcional
  const g = (window as any).__API_BASE__;
  if (typeof g === "string" && g.length > 0) return g;
  // 3) Fallback seguro a Render (tu backend)
  return "https://diracinstrumentacion.onrender.com";
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<AuthState>(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as AuthState) : { email: null, basicToken: null };
    } catch {
      return { email: null, basicToken: null };
    }
  });

  useEffect(() => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const getAuthHeader = useCallback(() => {
    return state.basicToken ? { Authorization: state.basicToken } : {};
  }, [state.basicToken]);

  const login = useCallback(async (email: string, password: string) => {
    const token = buildBasicToken(email.trim(), password);
    const api = getApiBase();
    const res = await fetch(`${api}/dirac/me/locations`, {
      headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: token },
      cache: "no-store",
    });

    if (res.status === 401) {
      throw new Error("Credenciales inválidas");
    }
    if (!res.ok) {
      throw new Error(`Error de autenticación (${res.status})`);
    }
    const ct = res.headers.get("content-type") || "";
    if (!ct.toLowerCase().includes("application/json")) {
      // Nos están devolviendo HTML (index.html) o algo que no es JSON → API mal configurada
      throw new Error("La URL de API no devuelve JSON. Configurá VITE_API_BASE hacia el backend.");
    }

    const data = await res.json().catch(() => null);
    if (!Array.isArray(data)) {
      throw new Error("Respuesta inesperada del backend en /dirac/me/locations");
    }

    setState({ email, basicToken: token });
  }, []);

  const logout = useCallback(() => {
    setState({ email: null, basicToken: null });
    sessionStorage.removeItem(STORAGE_KEY);
  }, []);

  const value = useMemo<AuthContextType>(() => ({
    isAuthenticated: !!state.basicToken,
    email: state.email,
    login,
    logout,
    getAuthHeader,
  }), [state.basicToken, state.email, login, logout, getAuthHeader]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

// Helper para fetch con auth ya inyectado
export function useAuthedFetch() {
  const { getAuthHeader } = useAuth();
  const apiBase = getApiBase();
  return useCallback(async (path: string, init: RequestInit = {}) => {
    const headers = {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init.headers || {}),
      ...getAuthHeader(),
    };
    const res = await fetch(`${apiBase}${path}`, { ...init, headers, cache: "no-store" });
    return res;
  }, [getAuthHeader, apiBase]);
}
