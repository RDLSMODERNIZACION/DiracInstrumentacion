import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

type CompanyAccess = {
  company_id: number;
  company_name: string;
  role?: string | null;
  is_primary?: boolean | null;
};

type AuthState = {
  email: string | null;
  basicToken: string | null;
};

type AuthContextType = {
  isAuthenticated: boolean;
  loading: boolean;
  email: string | null;
  userId: number | null;
  companyId: number | null;
  companyName: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  getAuthHeader: () => Record<string, string>;
};

const AuthContext = createContext<AuthContextType | null>(null);
const STORAGE_KEY = "dirac.basic";
const COMPANY_KEY = "dirac.company_id";

function buildBasicToken(email: string, password: string) {
  return `Basic ${btoa(`${email}:${password}`)}`;
}

function getApiBase() {
  const env = (import.meta as any)?.env?.VITE_API_BASE?.trim?.();
  if (env) return env;
  const g = (window as any).__API_BASE__;
  if (typeof g === "string" && g.length > 0) return g;
  return "https://diracinstrumentacion.onrender.com";
}

function loadSharedSession(): AuthState {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.basicToken) {
        return {
          email: parsed.email ?? null,
          basicToken: parsed.basicToken,
        };
      }
    }

    // Compatibilidad con sesiones antiguas del panel principal.
    const legacy =
      sessionStorage.getItem("dirac_basic") ||
      localStorage.getItem("dirac_basic");
    if (legacy) {
      return {
        email: localStorage.getItem("dirac_email"),
        basicToken: `Basic ${legacy}`,
      };
    }
  } catch {}

  return { email: null, basicToken: null };
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<AuthState>(() => loadSharedSession());
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<number | null>(null);
  const [companyId, setCompanyId] = useState<number | null>(null);
  const [companyName, setCompanyName] = useState<string | null>(null);

  const apiBase = useMemo(() => getApiBase(), []);

  const hydrateScope = useCallback(async (basicToken: string, fallbackEmail?: string | null) => {
    const res = await fetch(`${apiBase}/dirac/me`, {
      method: "GET",
      headers: { Accept: "application/json", Authorization: basicToken },
      cache: "no-store",
    });

    if (res.status === 401) throw new Error("Credenciales inválidas");
    if (!res.ok) throw new Error(`No se pudo validar la sesión (${res.status})`);

    const data = await res.json();
    const user = data?.user ?? {};
    const companies: CompanyAccess[] = Array.isArray(data?.companies) ? data.companies : [];

    // Administración queda limitada a empresas donde el usuario es owner/admin.
    const administrable = companies.filter((c) =>
      ["owner", "admin"].includes(String(c?.role ?? "").toLowerCase())
    );

    if (!administrable.length) {
      throw new Error("Tu usuario no tiene una empresa administrable asignada");
    }

    let requested: number | null = null;
    try {
      const raw = sessionStorage.getItem(COMPANY_KEY);
      const n = Number(raw);
      if (Number.isFinite(n)) requested = n;
    } catch {}

    const selected =
      administrable.find((c) => Number(c.company_id) === requested) ??
      administrable.find((c) => Number(c.company_id) === Number(data?.primary_company_id)) ??
      administrable.find((c) => !!c.is_primary) ??
      administrable[0];

    const cid = Number(selected.company_id);
    setUserId(Number(user?.id) || null);
    setCompanyId(cid);
    setCompanyName(selected.company_name ?? `Empresa #${cid}`);
    setState({ email: user?.email ?? fallbackEmail ?? null, basicToken });

    try {
      sessionStorage.setItem(COMPANY_KEY, String(cid));
      sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          email: user?.email ?? fallbackEmail ?? null,
          basicToken,
        })
      );
      sessionStorage.removeItem("dirac.admin.handoff");
    } catch {}
  }, [apiBase]);

  useEffect(() => {
    let alive = true;

    (async () => {
      if (!state.basicToken) {
        if (alive) setLoading(false);
        return;
      }

      try {
        await hydrateScope(state.basicToken, state.email);
      } catch {
        if (!alive) return;
        setState({ email: null, basicToken: null });
        setUserId(null);
        setCompanyId(null);
        setCompanyName(null);
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
    // Solo validamos la sesión inicial; login() vuelve a hidratar explícitamente.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getAuthHeader = useCallback(() => {
    const headers: Record<string, string> = {};
    if (state.basicToken) headers.Authorization = state.basicToken;
    if (companyId != null) headers["X-Company-Id"] = String(companyId);
    return headers;
  }, [state.basicToken, companyId]);

  const login = useCallback(async (email: string, password: string) => {
    setLoading(true);
    try {
      const em = email.trim().toLowerCase();
      const token = buildBasicToken(em, password);
      await hydrateScope(token, em);
    } finally {
      setLoading(false);
    }
  }, [hydrateScope]);

  const logout = useCallback(() => {
    setState({ email: null, basicToken: null });
    setUserId(null);
    setCompanyId(null);
    setCompanyName(null);
    try {
      sessionStorage.removeItem(STORAGE_KEY);
      sessionStorage.removeItem(COMPANY_KEY);
      sessionStorage.removeItem("dirac.admin.handoff");
    } catch {}
  }, []);

  const value = useMemo<AuthContextType>(() => ({
    isAuthenticated: !!state.basicToken && companyId != null,
    loading,
    email: state.email,
    userId,
    companyId,
    companyName,
    login,
    logout,
    getAuthHeader,
  }), [state.basicToken, state.email, loading, userId, companyId, companyName, login, logout, getAuthHeader]);

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

    return fetch(`${apiBase}${path}`, {
      ...init,
      headers,
      cache: "no-store",
    });
  }, [getAuthHeader, apiBase]);
}
