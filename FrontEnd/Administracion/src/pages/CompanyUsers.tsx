import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import Section from "../components/Section";
import { useApi } from "../lib/api";

type Row = { user_id: number; email: string; full_name?: string; role: string; is_primary: boolean };

export default function CompanyUsers() {
  const { id } = useParams();
  const { getJSON, postJSON } = useApi();
  const [rows, setRows] = useState<Row[]>([]);
  const [userEmail, setUserEmail] = useState("");
  const [role, setRole] = useState("viewer");

  async function load() {
    const r = await getJSON(`/dirac/companies/${id}/users`);
    setRows(r);
  }
  useEffect(()=>{ load(); }, [id]);

  async function addExisting() {
    // Buscar el user_id por email (admin endpoint)
    const u = await getJSON(`/dirac/admin/users?email=${encodeURIComponent(userEmail)}`);
    const user_id = u?.id || u?.user_id || u?.[0]?.id || u?.[0]?.user_id;
    if (!user_id) throw new Error("Usuario no encontrado");
    await postJSON(`/dirac/companies/${id}/users`, { user_id, role, is_primary: false });
    setUserEmail(""); setRole("viewer"); await load();
  }

  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">Usuarios de la empresa #{id}</h1>

      <Section title="Agregar usuario existente" right={null}>
        <div className="flex items-end gap-2">
          <div>
            <div className="text-xs text-slate-500">Email</div>
            <input className="border rounded px-2 py-1" value={userEmail} onChange={e=>setUserEmail(e.target.value)} />
          </div>
          <div>
            <div className="text-xs text-slate-500">Rol</div>
            <select className="border rounded px-2 py-1" value={role} onChange={e=>setRole(e.target.value)}>
              <option value="owner">owner</option>
              <option value="admin">admin</option>
              <option value="operator">operator</option>
              <option value="technician">technician</option>
              <option value="viewer">viewer</option>
            </select>
          </div>
          <button onClick={addExisting} className="px-3 py-1.5 rounded bg-blue-600 text-white">Agregar</button>
        </div>
      </Section>

      <Section title="Listado" right={null}>
        <table className="min-w-full text-sm">
          <thead><tr className="text-left">
            <th className="px-2 py-1">Email</th><th className="px-2 py-1">Nombre</th><th className="px-2 py-1">Rol</th><th className="px-2 py-1">Primaria</th>
          </tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.user_id} className="border-t">
                <td className="px-2 py-1">{r.email}</td>
                <td className="px-2 py-1">{r.full_name ?? "—"}</td>
                <td className="px-2 py-1">{r.role}</td>
                <td className="px-2 py-1">{r.is_primary ? "sí" : "no"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
    </div>
  );
}
