// src/components/auth/LogoutButton.tsx
import React from "react";
import { useAuth, useAuthedFetch } from "../../lib/auth";
import { SESSION_KEY } from "../activity/ActivityTracker";

export default function LogoutButton() {
  const { logout, email } = useAuth() as any;
  const api = useAuthedFetch();

  const handleLogout = async () => {
    try {
      const sessionId = Number(sessionStorage.getItem(SESSION_KEY));
      if (Number.isFinite(sessionId) && sessionId > 0) {
        await api("/dirac/activity/session/end", {
          method: "POST",
          body: JSON.stringify({
            session_id: sessionId,
            current_path: window.location.pathname,
          }),
        });
      }
    } catch {
      // El cierre de auditoría no debe impedir salir.
    } finally {
      sessionStorage.removeItem(SESSION_KEY);
      logout();
    }
  };

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => window.location.assign("/actividad")}
        className="hidden sm:inline-flex text-xs font-semibold text-slate-600 hover:text-slate-900"
        type="button"
      >
        Actividad
      </button>
      <button
        onClick={handleLogout}
        className="text-sm text-slate-600 hover:text-slate-900 underline"
        title={email || ""}
        type="button"
      >
        Salir
      </button>
    </div>
  );
}
