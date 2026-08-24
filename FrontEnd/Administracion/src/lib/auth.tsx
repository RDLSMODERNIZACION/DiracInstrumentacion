import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

type AuthState = { email: string | null; basicToken: string | null };
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
  const env = (import.meta as any)?.env?.VITE_API_BASE?.trim?.();
  if (env) return env;
  const g = (window as any).__API_BASE__;
  if (typeof g === "string" && g.length > 0) return g;
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

  const getAuthHeader = useCallback(() => (state.basicToken ? { Authorization: state.basicToken } : {}), [state.basicToken]);

  const login = useCallback(async (email: string, password: string) => {
    const username = email.trim().toLowerCase();

    if (username !== "admin" || password !== "admin") {
      throw new Error("Usuario o contraseÃ±a incorrectos");
    }

    // Sesion independiente de Administracion.
    // El token solo se usa como marcador de sesion del front administrativo.
    const token = buildBasicToken("admin", "admin");
    setState({ email: "admin", basicToken: token });
  }, []);

  const logout = useCallback(() => {
    setState({ email: null, basicToken: null });
    sessionStorage.removeItem(STORAGE_KEY);
  }, []);

  const value = useMemo(() => ({
    isAuthenticated: !!state.basicToken,
    email: state.email,
    login, logout, getAuthHeader
  }), [state.basicToken, state.email, login, logout, getAuthHeader]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

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
