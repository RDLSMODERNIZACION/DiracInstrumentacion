// src/components/scada/AppRoot.tsx
import React, { useEffect, useState } from "react";
import type { User } from "./types";
import ScadaApp from "./ScadaApp";
import { Routes, Route, useLocation, Navigate } from "react-router-dom";

export default function AppRoot() {
  const saved = typeof window !== "undefined" ? localStorage.getItem("rdls_user") : null;
  const initial = saved ? (JSON.parse(saved) as User) : null;
  const [user, setUser] = useState<User | null>(initial);

  const loc = useLocation();
  useEffect(()=>{ console.log("[AppRoot] route change →", loc.pathname); }, [loc.pathname]);

  if(!user){
    return (
      <div className="min-h-screen grid place-items-center"> 
        <button
          className="px-4 py-2 rounded-lg bg-slate-900 text-white"
          onClick={()=>{
            const u = { id:"u1", name:"operador@rdls", role:"operador" } as User;
            localStorage.setItem("rdls_user", JSON.stringify(u));
            setUser(u);
          }}>
          Entrar como Operador
        </button>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/*" element={<ScadaApp initialUser={user} />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
