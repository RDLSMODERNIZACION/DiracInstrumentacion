import React, { useState } from "react";
import { useAuth } from "../lib/auth";

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState("jefe@diracserviciosenergia.com");
  const [password, setPassword] = useState("admin123");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null); setLoading(true);
    try {
      await login(email, password);
    } catch (e:any) {
      setErr(e?.message || "Error de login");
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <form onSubmit={submit} className="w-full max-w-sm bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
        <h1 className="text-xl font-semibold mb-4">DIRAC — Administración</h1>

        <label className="block text-sm font-medium mb-1">Email</label>
        <input className="w-full border rounded px-3 py-2 mb-3" type="email" value={email} onChange={e=>setEmail(e.target.value)} required />

        <label className="block text-sm font-medium mb-1">Contraseña</label>
        <input className="w-full border rounded px-3 py-2 mb-2" type="password" value={password} onChange={e=>setPassword(e.target.value)} required />

        {err && <div className="text-sm text-red-600 mb-2">{err}</div>}

        <button className="w-full bg-blue-600 text-white rounded py-2 disabled:opacity-60" disabled={loading}>
          {loading ? "Verificando…" : "Entrar"}
        </button>
      </form>
    </div>
  );
}
