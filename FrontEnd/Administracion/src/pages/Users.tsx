import React, { useEffect, useState } from "react";
import Section from "../components/Section";
import { useApi } from "../lib/api";

type UserRow = { id: number; email: string; full_name?: string; status: string };

export default function Users() {
  const { getJSON, postJSON } = useApi();
  const [rows, setRows] = useState<UserRow[]>([]);
  const [email, setEmail] = useState("");
  const [full_name, setFullName] = useState("");
  const [password, setPassword] = useState("1234");

  async function load() {
    const r = await getJSON("/dirac/admin/users");
    setRows(r);
  }
  useEffect(()=>{ load(); }, []);

  async function create() {
    await postJSON("/dirac/users", { email, full_name, password });
    setEmail(""); setFullName(""); setPassword("1234");
    await load();
  }

  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">Usuarios</h1>

      <Section title="Crear usuario" right={null}>
        <div className="flex flex-wrap items-end gap-2">
          <div><div className="text-xs text-slate-500">Email</div>
            <input className="border rounded px-2 py-1" value={email} onChange={e=>setEmail(e.target.value)} /></div>
          <div><div className="text-xs text-slate-500">Nombre</div>
            <input className="border rounded px-2 py-1" value={full_name} onChange={e=>setFullName(e.target.value)} /></div>
          <div><div className="text-xs text-slate-500">Password</div>
            <input className="border rounded px-2 py-1" value={password} onChange={e=>setPassword(e.target.value)} /></div>
          <button onClick={create} className="px-3 py-1.5 rounded bg-blue-600 text-white">Crear</button>
        </div>
      </Section>

      <Section title="Listado" right={null}>
        <table className="min-w-full text-sm">
          <thead><tr className="text-left">
            <th className="px-2 py-1">ID</th><th className="px-2 py-1">Email</th><th className="px-2 py-1">Nombre</th><th className="px-2 py-1">Estado</th>
          </tr></thead>
          <tbody>
            {rows.map(u => (
              <tr key={u.id} className="border-t">
                <td className="px-2 py-1">{u.id}</td><td className="px-2 py-1">{u.email}</td><td className="px-2 py-1">{u.full_name ?? "—"}</td><td className="px-2 py-1">{u.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
    </div>
  );
}
