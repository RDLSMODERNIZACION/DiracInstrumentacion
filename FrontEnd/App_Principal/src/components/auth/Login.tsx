import React, { useState } from "react";
import { useAuth } from "../../lib/auth";

export default function Login({ onSuccess }: { onSuccess?: () => void }) {
  const { login } = useAuth();
  const [email, setEmail] = useState("operador@diracserviciosenergia.com");
  const [password, setPassword] = useState("1234");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      await login(email, password);
      onSuccess?.();
    } catch (e: any) {
      // Mensajes claros para los casos típicos
      const msg = String(e?.message || e);
      if (msg.includes("Credenciales inválidas")) setErr("Email o contraseña incorrectos.");
      else if (msg.includes("URL de API")) setErr("API mal configurada en el front (revisar VITE_API_BASE).");
      else setErr(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <form onSubmit={submit} className="w-full max-w-sm bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
        <h1 className="text-xl font-semibold mb-4">Ingresar a DIRAC</h1>

        <label className="block text-sm font-medium mb-1">Email</label>
        <input
          type="email"
          value={email}
          onChange={e=>setEmail(e.target.value)}
          className="w-full border rounded-lg px-3 py-2 mb-3"
          placeholder="usuario@empresa.com"
          required
        />

        <label className="block text-sm font-medium mb-1">Contraseña</label>
        <input
          type="password"
          value={password}
          onChange={e=>setPassword(e.target.value)}
          className="w-full border rounded-lg px-3 py-2 mb-2"
          placeholder="••••"
          required
          minLength={4}
        />

        {err && <div className="text-red-600 text-sm mb-3">{err}</div>}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-blue-600 text-white py-2 font-medium hover:bg-blue-700 disabled:opacity-60"
        >
          {loading ? "Verificando..." : "Entrar"}
        </button>

        <p className="text-xs text-slate-500 mt-3">
          Modo prueba: se usa HTTP Basic (email + contraseña) en cada request.
        </p>
      </form>
    </div>
  );
}
