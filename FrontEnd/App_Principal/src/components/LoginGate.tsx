// src/components/LoginGate.tsx
import React, { useMemo, useState } from "react";
import { useApi } from "../lib/api";

function hasAuth() {
  return !!(
    localStorage.getItem("dirac_basic") ||
    sessionStorage.getItem("dirac_basic")
  );
}

function setAuth(email: string, pass: string, remember: boolean) {
  const token = btoa(`${email}:${pass}`);
  if (remember) localStorage.setItem("dirac_basic", token);
  else sessionStorage.setItem("dirac_basic", token);
}

export default function LoginGate({ children }: { children: React.ReactNode }) {
  const { getJSON } = useApi();
  const [email, setEmail] = useState(localStorage.getItem("dirac_email") || "");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [checking, setChecking] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(hasAuth());

  const form = useMemo(() => !ok, [ok]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setChecking(true);
    try {
      const em = email.trim().toLowerCase();
      setAuth(em, password, remember);
      localStorage.setItem("dirac_email", em);
      // Validar contra endpoint real del backend: /dirac/me/locations
      await getJSON("/dirac/me/locations");
      setOk(true);
    } catch (e: any) {
      localStorage.removeItem("dirac_basic");
      sessionStorage.removeItem("dirac_basic");
      setErr(e?.message || "Credenciales inválidas");
    } finally {
      setChecking(false);
    }
  }

  if (!form) return <>{children}</>;

  return (
    <div className="min-h-screen grid place-items-center bg-slate-50 p-4">
      <form
        onSubmit={onSubmit}
        className="bg-white border rounded p-4 w-full max-w-sm space-y-3"
      >
        <h1 className="text-lg font-semibold">Ingresar</h1>

        <div>
          <div className="text-xs text-slate-500">Email</div>
          <input
            className="border rounded px-2 py-1 w-full"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div>
          <div className="text-xs text-slate-500">Contraseña</div>
          <input
            className="border rounded px-2 py-1 w-full"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
          />
          Recordarme en este equipo
        </label>

        {err && <div className="text-sm text-red-600">{err}</div>}

        <button
          type="submit"
          disabled={checking}
          className="px-3 py-1.5 rounded bg-slate-900 text-white w-full"
        >
          {checking ? "Verificando…" : "Ingresar"}
        </button>
      </form>
    </div>
  );
}
