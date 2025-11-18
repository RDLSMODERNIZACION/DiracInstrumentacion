// src/components/auth/LogoutButton.tsx
import React from "react";
import { useAuth } from "../../lib/auth";

export default function LogoutButton() {
  const { logout, email } = useAuth() as any;
  return (
    <button
      onClick={logout}
      className="text-sm text-slate-600 hover:text-slate-900 underline"
      title={email || ""}
    >
      Salir
    </button>
  );
}
