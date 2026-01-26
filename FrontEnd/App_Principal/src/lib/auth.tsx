import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

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
  apiBase: string;
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

function isGetLike(method?: string) {
  const m = (method || "GET").toUpperCase();
  return m === "GET" || m === "HEAD";
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [state, setState] = useState<AuthState>(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      return raw
        ? (JSON.parse(raw) as AuthState)
        : { email: null, basicToken: null };
    } catch {
      return { email: null, basicToken: null };
    }
  });

  useEffect(() => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const apiBase = useMemo(() => getApiBase(), []);

  const getAuthHeader = useCallback(() => {
    return state.basicToken ? { Authorization: state.basicToken } : {};
  }, [state.basicToken]);

  /**
   * Login: acá SÍ usamos Authorization porque justamente estamos validando credenciales.
   * Ojo: NO conviene enviar Content-Type en un GET si querés evitar preflight,
   * pero como es una llamada “de login” no importa tanto.
   */
  const login = useCallback(
    async (email: string, password: string) => {
      const token = buildBasicToken(email.trim(), password);

      const res = await fetch(`${apiBase}/dirac/me/locations`, {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: token,
        },
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
        throw new Error(
          "La URL de API no devuelve JSON. Configurá VITE_API_BASE hacia el backend."
        );
      }

      const data = await res.json().catch(() => null);
      if (!Array.isArray(data)) {
        throw new Error("Respuesta inesperada del backend en /dirac/me/locations");
      }

      setState({ email, basicToken: token });
    },
    [apiBase]
  );

  const logout = useCallback(() => {
    setState({ email: null, basicToken: null });
    sessionStorage.removeItem(STORAGE_KEY);
  }, []);

  const value = useMemo<AuthContextType>(
    () => ({
      isAuthenticated: !!state.basicToken,
      email: state.email,
      login,
      logout,
      getAuthHeader,
      apiBase,
    }),
    [state.basicToken, state.email, login, logout, getAuthHeader, apiBase]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

/**
 * ✅ Fetch público (SIN Authorization) para endpoints tipo:
 * - /locations
 * - /companies
 * - /pumps/config
 * - /tanks/config
 *
 * Esto evita preflight CORS.
 */
export function usePublicFetch() {
  const { apiBase } = useAuth();

  return useCallback(
    async (path: string, init: RequestInit = {}) => {
      const method = (init.method || "GET").toUpperCase();

      // Para GET/HEAD: NO mandamos Content-Type (evita preflight)
      // Para POST/PUT/PATCH: si mandás JSON, sí corresponde Content-Type
      const headers: Record<string, string> = {
        Accept: "application/json",
        ...(init.headers as any),
      };

      if (!isGetLike(method) && !headers["Content-Type"]) {
        headers["Content-Type"] = "application/json";
      }

      const res = await fetch(`${apiBase}${path}`, {
        ...init,
        method,
        headers,
        // NO forzamos no-store: dejamos que el browser/cache/ETag funcione
      });

      return res;
    },
    [apiBase]
  );
}

/**
 * ✅ Fetch con auth (Authorization) SOLO cuando lo necesitás.
 * Además:
 * - No mete Content-Type en GET/HEAD (reduce preflight)
 * - No fuerza cache: "no-store" por defecto (lo podés pasar por init si querés)
 */
export function useAuthedFetch() {
  const { getAuthHeader, apiBase } = useAuth();

  return useCallback(
    async (path: string, init: RequestInit = {}) => {
      const method = (init.method || "GET").toUpperCase();

      const headers: Record<string, string> = {
        Accept: "application/json",
        ...(init.headers as any),
        ...getAuthHeader(), // Authorization
      };

      // Content-Type solo para métodos con body
      if (!isGetLike(method) && !headers["Content-Type"]) {
        headers["Content-Type"] = "application/json";
      }

      const res = await fetch(`${apiBase}${path}`, {
        ...init,
        method,
        headers,
      });

      return res;
    },
    [getAuthHeader, apiBase]
  );
}
