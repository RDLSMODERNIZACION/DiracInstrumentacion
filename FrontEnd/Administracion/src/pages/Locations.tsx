// src/pages/Locations.tsx
import React, { useEffect, useMemo, useState } from "react";
import Section from "../components/Section";
import { useApi } from "../lib/api";
import SlideOver from "../components/SlideOver";
import LocationEditor from "../components/LocationEditor";

type Location = {
  id: number;
  name: string;
  company_id?: number | null;
  address?: string | null;
  lat?: number | null;
  lon?: number | null;
};

type CompanyRow = { id: number; name: string; status?: string };
type UserRow = { id: number; email: string; full_name?: string | null };

export default function Locations() {
  const { getJSON, postJSON } = useApi();

  // Listado
  const [items, setItems] = useState<Location[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Crear
  const [name, setName] = useState("");
  const [createCompanyId, setCreateCompanyId] = useState<number | "">("");

  // Filtros
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [filterCompanyId, setFilterCompanyId] = useState<number | "">("");
  const [filterUserId, setFilterUserId] = useState<number | "">("");
  const [showOnlyExplicit, setShowOnlyExplicit] = useState(false);

  // Usuarios de la empresa seleccionada
  const [companyUsers, setCompanyUsers] = useState<UserRow[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  // Editor
  const [editing, setEditing] = useState<Location | null>(null);

  // ---- cargar empresas para selects (crear + filtros)
  async function loadCompanies() {
    const rows: CompanyRow[] = await getJSON("/dirac/admin/companies");
    setCompanies(rows);
  }

  // ---- cargar usuarios por empresa (intenta dos endpoints)
  async function loadUsersForCompany(companyId: number): Promise<UserRow[]> {
    try {
      const rows: UserRow[] = await getJSON(
        `/dirac/admin/users?company_id=${companyId}`
      );
      return rows;
    } catch {
      try {
        const rows: UserRow[] = await getJSON(
          `/dirac/admin/companies/${companyId}/users`
        );
        return rows;
      } catch {
        return [];
      }
    }
  }

  // ---- cargar listado según filtros
  async function load() {
    setLoading(true);
    setErr(null);
    try {
      // Si hay usuario seleccionado → localidades disponibles para ese usuario (acotadas a la empresa)
      if (filterUserId !== "") {
        const qs =
          filterCompanyId !== "" ? `?company_id=${Number(filterCompanyId)}` : "";
        const acc = await getJSON(
          `/dirac/admin/users/${Number(filterUserId)}/locations${qs}`
        );

        const effective = Array.isArray(acc?.effective) ? acc.effective : [];
        const explicit = Array.isArray(acc?.explicit) ? acc.explicit : [];
        const merged = showOnlyExplicit ? explicit : [...effective, ...explicit];

        // Seguridad extra: filtrar por empresa por si el backend ignora el query param
        const filteredByCompany =
          filterCompanyId !== ""
            ? merged.filter(
                (r: any) => Number(r.company_id) === Number(filterCompanyId)
              )
            : merged;

        // Normalizamos y deduplicamos por location_id
        const byId = new Map<number, Location>();
        for (const r of filteredByCompany) {
          const id = Number(r.location_id);
          if (!byId.has(id)) {
            byId.set(id, {
              id,
              name: r.location_name ?? `Loc ${id}`,
              company_id: r.company_id ?? null,
            });
          }
        }
        setItems(Array.from(byId.values()).sort((a, b) => a.id - b.id));
        setLoading(false);
        return;
      }

      // Si no hay usuario pero sí empresa → todas las localidades de esa empresa
      if (filterCompanyId !== "") {
        const rows = await getJSON(
          `/dirac/admin/locations?company_id=${Number(filterCompanyId)}`
        );
        setItems(rows);
        setLoading(false);
        return;
      }

      // Sin filtros → todas
      const rows = await getJSON("/dirac/admin/locations");
      setItems(rows);
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  // Inicial
  useEffect(() => {
    loadCompanies();
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cuando cambia la empresa: reset del usuario + carga de usuarios de esa empresa
  useEffect(() => {
    (async () => {
      setCompanyUsers([]);
      setFilterUserId("");
      if (filterCompanyId === "") return;
      setLoadingUsers(true);
      try {
        const users = await loadUsersForCompany(Number(filterCompanyId));
        setCompanyUsers(users);
      } catch (e: any) {
        setErr(e?.message || String(e));
      } finally {
        setLoadingUsers(false);
      }
    })();
  }, [filterCompanyId]);

  // Autorefresco al cambiar filtros (empresa/usuario/flag explícito)
  useEffect(() => {
    if (filterCompanyId !== "" || filterUserId !== "") {
      load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterCompanyId, filterUserId, showOnlyExplicit]);

  // ---- crear localización
  async function create() {
    setErr(null);
    try {
      const payload: any = { name: name.trim() };
      if (!payload.name) {
        setErr("Ingresá un nombre");
        return;
      }
      if (createCompanyId !== "") payload.company_id = Number(createCompanyId);
      await postJSON("/dirac/locations", payload);
      setName("");
      setCreateCompanyId("");
      await load();
    } catch (e: any) {
      setErr(e?.message || String(e));
    }
  }

  // ---- utilidades
  const companyOpts = useMemo(
    () =>
      companies
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((c) => ({ id: c.id, label: `${c.name} #${c.id}` })),
    [companies]
  );

  const companiesById = useMemo(() => {
    const m = new Map<number, CompanyRow>();
    companies.forEach((c) => m.set(c.id, c));
    return m;
  }, [companies]);

  const userOpts = useMemo(
    () =>
      companyUsers
        .slice()
        .sort((a, b) =>
          (a.full_name || a.email).localeCompare(b.full_name || b.email)
        )
        .map((u) => ({
          id: u.id,
          label: u.full_name ? `${u.full_name} — ${u.email}` : u.email,
        })),
    [companyUsers]
  );

  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">Localizaciones</h1>

      {/* Filtros */}
      <Section title="Filtros" right={null}>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <div className="text-xs text-slate-500">Empresa</div>
            <select
              className="border rounded px-2 py-1"
              value={filterCompanyId}
              onChange={(e) =>
                setFilterCompanyId(
                  e.target.value === "" ? "" : Number(e.target.value)
                )
              }
            >
              <option value="">(todas)</option>
              {companyOpts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          {/* Usuario (dropdown atado a la empresa) */}
          <div>
            <div className="text-xs text-slate-500">
              Usuario {filterCompanyId !== "" && "(de la empresa seleccionada)"}
            </div>
            <select
              className="border rounded px-2 py-1 min-w-[16rem]"
              value={filterUserId}
              onChange={(e) =>
                setFilterUserId(
                  e.target.value === "" ? "" : Number(e.target.value)
                )
              }
              disabled={
                filterCompanyId === "" || loadingUsers || userOpts.length === 0
              }
              title={
                filterCompanyId === ""
                  ? "Seleccioná una empresa primero"
                  : userOpts.length === 0
                  ? "La empresa no tiene usuarios asignados"
                  : ""
              }
            >
              <option value="">(todos)</option>
              {userOpts.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.label}
                </option>
              ))}
            </select>
            {filterCompanyId !== "" && loadingUsers && (
              <div className="text-xs text-slate-400 mt-1">
                Cargando usuarios…
              </div>
            )}
            {filterCompanyId === "" && (
              <div className="text-xs text-slate-400 mt-1">
                Seleccioná una empresa primero
              </div>
            )}
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={showOnlyExplicit}
              onChange={(e) => setShowOnlyExplicit(e.target.checked)}
              disabled={filterUserId === ""}
            />
            Sólo accesos explícitos
          </label>

          <div className="flex gap-2">
            <button
              onClick={load}
              className="px-3 py-1.5 rounded bg-slate-900 text-white"
            >
              Aplicar
            </button>
            <button
              onClick={async () => {
                setFilterCompanyId("");
                setFilterUserId("");
                setShowOnlyExplicit(false);
                setCompanyUsers([]);
                await load();
              }}
              className="px-3 py-1.5 rounded bg-slate-200"
            >
              Limpiar
            </button>
          </div>
        </div>
        {err && <div className="text-sm text-red-600 mt-2">{err}</div>}
      </Section>

      {/* Crear */}
      <Section title="Crear localización" right={null}>
        <div className="flex items-end gap-3 flex-wrap">
          <div>
            <div className="text-xs text-slate-500">Nombre</div>
            <input
              className="border rounded px-2 py-1"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej. Planta Oeste"
            />
          </div>
          <div>
            <div className="text-xs text-slate-500">Empresa (opcional)</div>
            <select
              className="border rounded px-2 py-1"
              value={createCompanyId}
              onChange={(e) =>
                setCreateCompanyId(
                  e.target.value === "" ? "" : Number(e.target.value)
                )
              }
            >
              <option value="">(sin empresa)</option>
              {companyOpts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={create}
            className="px-3 py-1.5 rounded bg-blue-600 text-white"
          >
            Crear
          </button>
        </div>
      </Section>

      {/* Listado */}
      <Section
        title="Listado (click en una fila para editar)"
        right={
          loading ? (
            <span className="text-xs text-slate-500">Cargando…</span>
          ) : null
        }
      >
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left">
              <th className="px-2 py-1">ID</th>
              <th className="px-2 py-1">Nombre</th>
              <th className="px-2 py-1">Empresa</th>
            </tr>
          </thead>
          <tbody>
            {items.map((l) => (
              <tr
                key={l.id}
                className="border-t hover:bg-slate-50 cursor-pointer"
                onClick={() => setEditing(l)}
              >
                <td className="px-2 py-1">{l.id}</td>
                <td className="px-2 py-1">{l.name}</td>
                <td className="px-2 py-1">
                  {l.company_id
                    ? companiesById.get(Number(l.company_id))?.name ??
                      l.company_id
                    : "—"}
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={3} className="px-2 py-6 text-center text-slate-500">
                  {loading ? "Cargando…" : "Sin localizaciones"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Section>

      {/* Editor */}
      <SlideOver
        open={!!editing}
        title={editing ? `Editar localización #${editing.id}` : ""}
        onClose={() => setEditing(null)}
      >
        {editing && (
          <LocationEditor
            location={editing as any}
            onSaved={async () => {
              setEditing(null);
              await load();
            }}
            onClose={() => setEditing(null)}
          />
        )}
      </SlideOver>
    </div>
  );
}
