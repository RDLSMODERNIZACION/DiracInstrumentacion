import React, { useState } from "react";
import { useAuth } from "../../lib/auth";

export default function Login({ onSuccess }: { onSuccess?: () => void }) {
  const { login } = useAuth();

  // En producción empezamos vacíos (sin credenciales reales)
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setLoading(true);

    try {
      await login(email.trim(), password);
      onSuccess?.();
    } catch (e: any) {
      const msg = String(e?.message || e);

      if (msg.includes("Credenciales inválidas")) {
        setErr("Email o contraseña incorrectos. Verificá tus datos e intentá nuevamente.");
      } else if (msg.includes("URL de API")) {
        setErr("Error de configuración de API en el front (revisar VITE_API_BASE).");
      } else if (msg.toLowerCase().includes("network") || msg.toLowerCase().includes("fetch")) {
        setErr("No se pudo conectar con el servidor. Verificá tu conexión o contactá al administrador.");
      } else {
        setErr(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md">
        {/* Logo / título */}
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-semibold text-slate-900">DIRAC – Panel de monitoreo</h1>
          <p className="text-sm text-slate-500 mt-1">
            Ingresá con las credenciales asignadas por tu administrador.
          </p>
        </div>

        <form
          onSubmit={submit}
          className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm"
        >
          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Email institucional
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 placeholder:text-slate-400"
              placeholder="operador@ejemplo.com"
              autoComplete="username"
              required
            />
          </div>

          <div className="mb-2">
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-sm font-medium text-slate-700">
                Contraseña
              </label>
              <span className="text-xs text-slate-400">
                Mínimo 8 caracteres
              </span>
            </div>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 placeholder:text-slate-400"
              placeholder="Contraseña"
              autoComplete="current-password"
              required
              minLength={4}
            />
          </div>

          {/* Opcional: recordar sesión (solo visual si todavía no lo manejás en el back) */}
          <div className="flex items-center justify-between mt-1 mb-3">
            <label className="flex items-center gap-2 text-xs text-slate-600">
              <input
                type="checkbox"
                className="rounded border-slate-300"
                // por ahora solo visual; después podés engancharlo a lógica
                onChange={() => {}}
              />
              Recordar este dispositivo
            </label>
            <button
              type="button"
              className="text-xs text-blue-600 hover:underline"
              // Después lo podés enlazar a un flujo real de recuperación
              onClick={() => {
                setErr("Si olvidaste tu contraseña, contactá al administrador de DIRAC.");
              }}
            >
              ¿Olvidaste tu contraseña?
            </button>
          </div>

          {err && (
            <div className="text-red-600 text-xs mb-3 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {err}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-blue-600 text-white py-2.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? "Verificando credenciales..." : "Ingresar"}
          </button>

          <p className="text-[11px] text-slate-500 mt-3 leading-relaxed">
            Este panel está destinado únicamente a personal autorizado. 
            Todas las acciones pueden quedar registradas para auditoría.
          
          </p>
        </form>

        
      </div>
    </div>
  );
}
