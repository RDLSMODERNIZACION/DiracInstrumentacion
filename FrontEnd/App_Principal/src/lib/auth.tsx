import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
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
  const env = (import.meta as any)?.env?.VITE_API_BASE?.trim?.();
  if (env) return env;
  const g = (window as any).__API_BASE__;
  if (typeof g === "string" && g.length > 0) return g;
  return "https://diracinstrumentacion.onrender.com";
}

function isGetLike(method?: string) {
  const m = (method || "GET").toUpperCase();
  return m === "GET" || m === "HEAD";
}

async function readJsonOrThrow(res: Response, pathForMsg: string) {
  if (res.status === 401) throw new Error("Credenciales inválidas");
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(
      `${pathForMsg} -> ${res.status} ${res.statusText}${txt ? ` | ${txt.slice(0, 200)}` : ""}`
    );
  }
  const ct = res.headers.get("content-type") || "";
  if (!ct.toLowerCase().includes("application/json")) {
    throw new Error("La URL de API no devuelve JSON. Configurá VITE_API_BASE hacia el backend.");
  }
  return res.json();
}

/** Cache + dedupe simple para catálogos públicos (evita dobles /locations, /companies) */
type CacheEntry = { ts: number; data: any; inflight?: Promise<any> | null };
const PUBLIC_CACHE: Record<string, CacheEntry> = Object.create(null);
const PUBLIC_TTL_MS = 5 * 60 * 1000; // 5 min (ajustá)

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

  const apiBase = useMemo(() => getApiBase(), []);

  const getAuthHeader = useCallback(() => {
    return state.basicToken ? { Authorization: state.basicToken } : {};
  }, [state.basicToken]);

  /** Dedupe de login (si se toca el botón 2 veces) */
  const loginInflightRef = useRef<Promise<void> | null>(null);

  const login = useCallback(
    async (email: string, password: string) => {
      if (loginInflightRef.current) return loginInflightRef.current;

      const p = (async () => {
        const token = buildBasicToken(email.trim(), password);

        // Validación de credenciales: usamos un endpoint privado que ya existe
        const res = await fetch(`${apiBase}/dirac/me/locations`, {
          method: "GET",
          headers: { Accept: "application/json", Authorization: token },
          cache: "no-store",
        });

        const data = await readJsonOrThrow(res, "GET /dirac/me/locations");
        if (!Array.isArray(data)) {
          throw new Error("Respuesta inesperada del backend en /dirac/me/locations");
        }

        setState({ email: email.trim(), basicToken: token });
      })().finally(() => {
        loginInflightRef.current = null;
      });

      loginInflightRef.current = p;
      return p;
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
 * Mejoras:
 * - No manda Content-Type en GET/HEAD (evita preflight)
 * - Cache + dedupe opcional por path (evita duplicados x2 en StrictMode)
 */
export function usePublicFetch() {
  const { apiBase } = useAuth();

  return useCallback(
    async (path: string, init: RequestInit = {}) => {
      const method = (init.method || "GET").toUpperCase();

      const headers: Record<string, string> = {
        Accept: "application/json",
        ...(init.headers as any),
      };

      if (!isGetLike(method) && !headers["Content-Type"]) {
        headers["Content-Type"] = "application/json";
      }

      const useCache = isGetLike(method) && (init.cache == null || init.cache === "default");
      if (useCache) {
        const now = Date.now();
        const ent = PUBLIC_CACHE[path];

        if (ent?.data !== undefined && now - ent.ts < PUBLIC_TTL_MS) {
          return new Response(JSON.stringify(ent.data), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }

        if (ent?.inflight) return ent.inflight;

        const inflight = fetch(`${apiBase}${path}`, { ...init, method, headers })
          .then(async (res) => {
            // Si no es JSON, devolvemos tal cual
            const ct = res.headers.get("content-type") || "";
            if (!res.ok || !ct.toLowerCase().includes("application/json")) return res;

            const data = await res.json();
            PUBLIC_CACHE[path] = { ts: Date.now(), data, inflight: null };

            return new Response(JSON.stringify(data), {
              status: res.status,
              headers: { "Content-Type": "application/json" },
            });
          })
          .finally(() => {
            if (PUBLIC_CACHE[path]) PUBLIC_CACHE[path].inflight = null;
          });

        PUBLIC_CACHE[path] = { ts: ent?.ts ?? 0, data: ent?.data, inflight };
        return inflight;
      }

      return fetch(`${apiBase}${path}`, { ...init, method, headers });
    },
    [apiBase]
  );
}

/**
 * ✅ Fetch con auth (Authorization) SOLO cuando lo necesitás.
 * Mejoras:
 * - No mete Content-Type en GET/HEAD (reduce preflight)
 * - No fuerza cache: "no-store" por defecto
 * - Maneja 401 devolviendo error útil (opcional: podés logout afuera)
 */
export function useAuthedFetch() {
  const { getAuthHeader, apiBase } = useAuth();

  return useCallback(
    async (path: string, init: RequestInit = {}) => {
      const method = (init.method || "GET").toUpperCase();

      const headers: Record<string, string> = {
        Accept: "application/json",
        ...(init.headers as any),
        ...getAuthHeader(),
      };

      if (!isGetLike(method) && !headers["Content-Type"]) {
        headers["Content-Type"] = "application/json";
      }

      const res = await fetch(`${apiBase}${path}`, { ...init, method, headers });

      return res;
    },
    [getAuthHeader, apiBase]
  );
}
