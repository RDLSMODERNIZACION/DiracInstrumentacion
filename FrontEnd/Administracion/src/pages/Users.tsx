import React, { useEffect, useState } from "react";
import Section from "../components/Section";
import { useApi } from "../lib/api";
import { useAuth } from "../lib/auth";
import SlideOver from "../components/SlideOver";
import UserEditor from "../components/UserEditor";

type UserRow = { id: number; email: string; full_name?: string; status: string };
type Location = { id: number; name: string; company_id?: number | null };

export default function Users() {
  const { getJSON } = useApi();
  const { companyName } = useAuth();
  const [rows, setRows] = useState<UserRow[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [locationId, setLocationId] = useState<number | "">("");
  const [selected, setSelected] = useState<UserRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const [ls, users] = await Promise.all([
        getJSON("/dirac/admin/locations"),
        getJSON(
          locationId !== ""
            ? `/dirac/admin/users?location_id=${Number(locationId)}`
            : "/dirac/admin/users"
        ),
      ]);

      setLocations(Array.isArray(ls) ? ls : []);
      setRows(Array.isArray(users) ? users : users?.id ? [users] : []);
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationId]);

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-semibold">Usuarios</h1>
        <div className="mt-1 text-sm text-slate-500">
          Empresa: <span className="font-semibold text-slate-700">{companyName ?? "—"}</span>
        </div>
      </div>

      <Section title="Filtros" right={null}>
        <div className="flex items-end gap-2 flex-wrap">
          <div>
            <div className="text-xs text-slate-500">Localización</div>
            <select
              className="border rounded px-2 py-1 min-w-[220px]"
              value={locationId}
              onChange={(e) =>
                setLocationId(e.target.value === "" ? "" : Number(e.target.value))
              }
            >
              <option value="">(todas las de esta empresa)</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={load}
            disabled={loading}
            className="px-3 py-1.5 rounded bg-slate-900 text-white disabled:opacity-50"
          >
            {loading ? "Cargando…" : "Buscar"}
          </button>
        </div>
        {err && <div className="mt-3 text-sm text-red-600">{err}</div>}
      </Section>

      <Section title="Listado (click en una fila para editar)" right={null}>
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left">
              <th className="px-2 py-1">ID</th>
              <th className="px-2 py-1">Email</th>
              <th className="px-2 py-1">Nombre</th>
              <th className="px-2 py-1">Estado</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => (
              <tr
                key={u.id}
                className="border-t hover:bg-slate-50 cursor-pointer"
                onClick={() => setSelected(u)}
              >
                <td className="px-2 py-1">{u.id}</td>
                <td className="px-2 py-1">{u.email}</td>
                <td className="px-2 py-1">{u.full_name ?? "—"}</td>
                <td className="px-2 py-1">{u.status}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-2 py-6 text-center text-slate-500">
                  Sin resultados para esta empresa
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Section>

      <SlideOver
        open={!!selected}
        title={selected ? `Editar usuario #${selected.id}` : ""}
        onClose={() => setSelected(null)}
      >
        {selected && (
          <UserEditor
            user={selected}
            onClose={() => setSelected(null)}
            onSaved={async () => {
              await load();
              setSelected(null);
            }}
          />
        )}
      </SlideOver>
    </div>
  );
}
