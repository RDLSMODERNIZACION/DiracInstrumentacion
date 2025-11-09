// src/pages/Manifolds.tsx
import React, { useEffect, useMemo, useState } from "react";
import Section from "../components/Section";
import { useApi } from "../lib/api";
import LocationPicker from "../components/LocationPicker";
import SlideOver from "../components/SlideOver";
import ManifoldEditor from "../components/ManifoldEditor";

type Manifold = { id: number; name: string; location_id?: number | null };
type CompanyRow = { id: number; name: string; status?: string };
type LocationRow = { id: number; name: string; company_id?: number | null };
type UserRow = { id: number; email: string; full_name?: string | null };

type LocValue =
  | { mode: "existing"; company_id: number; location_id: number }
  | { mode: "new"; company_id: number; location_name: string };

export default function Manifolds() {
  const { getJSON, postJSON, del } = useApi();

  // listado
  const [items, setItems] = useState<Manifold[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // catálogos
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [companyUsers, setCompanyUsers] = useState<UserRow[]>([]);
  const [userLocations, setUserLocations] = useState<LocationRow[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [loadingLocations, setLoadingLocations] = useState(false);

  // filtros (igual que en Tanks/Valves)
  const [filterCompanyId, setFilterCompanyId] = useState<number | "">("");
  const [filterUserId, setFilterUserId] = useState<number | "">("");
  const [filterLocationId, setFilterLocationId] = useState<number | "">("");

  // creación (igual patrón: nombre + LocationPicker)
  const [name, setName] = useState("");
  const [loc, setLoc] = useState<LocValue | undefined>(undefined);

  // editor
  const [editing, setEditing] = useState<Manifold | null>(null);

  // --------- loaders base ----------
  async function loadCompanies() {
    const rows: CompanyRow[] = await getJSON("/dirac/admin/companies");
    setCompanies(rows);
  }

  async function loadLocations(cid?: number) {
    setLoadingLocations(true);
    try {
      const rows: LocationRow[] = await getJSON(
        cid ? `/dirac/admin/locations?company_id=${cid}` : "/dirac/admin/locations"
      );
      setLocations(rows);
    } finally {
      setLoadingLocations(false);
    }
  }

  async function loadUsersForCompany(companyId: number): Promise<UserRow[]> {
    try {
      return await getJSON(`/dirac/admin/users?company_id=${companyId}`);
    } catch {
      try {
        return await getJSON(`/dirac/admin/companies/${companyId}/users`);
      } catch {
        return [];
      }
    }
  }

  async function loadUserLocationsForCompany(userId: number, companyId?: number) {
    try {
      const qs = companyId ? `?company_id=${companyId}` : "";
      const acc = await getJSON(`/dirac/admin/users/${userId}/locations${qs}`);
      const effective = Array.isArray(acc?.effective) ? acc.effective : [];
      const explicit = Array.isArray(acc?.explicit) ? acc.explicit : [];
      const merged = [...effective, ...explicit];

      // normalizamos/dedupe por location_id
      const byId = new Map<number, LocationRow>();
      for (const r of merged) {
        const id = Number(r.location_id);
        if (!byId.has(id)) {
          byId.set(id, {
            id,
            name: r.location_name ?? `Loc ${id}`,
            company_id: r.company_id ?? null,
          });
        }
      }
      setUserLocations(Array.from(byId.values()));
    } catch {
      setUserLocations([]);
    }
  }

  // lector robusto como Tanks: intenta view y cae a admin
  async function readManifolds(params: { company_id?: number; location_id?: number }): Promise<Manifold[]> {
    const qs = new URLSearchParams();
    if (params.company_id) qs.set("company_id", String(params.company_id));
    if (params.location_id) qs.set("location_id", String(params.location_id));
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    // 1) view (si existiera)
    try {
      const rows: Manifold[] = await getJSON(`/dirac/manifolds${suffix}`);
      return Array.isArray(rows) ? rows : [];
    } catch (e: any) {
      // 2) admin
      const rows: Manifold[] = await getJSON(`/dirac/admin/manifolds${suffix}`);
      return Array.isArray(rows) ? rows : [];
    }
  }

  // --------- carga con filtros (idéntico flujo a Tanks) ----------
  async function load() {
    setLoading(true);
    setErr(null);
    try {
      // A) usuario seleccionado → filtra por ubicaciones a las que accede ese usuario (y opcional empresa/ubicación)
      if (filterUserId !== "") {
        const cid = filterCompanyId !== "" ? Number(filterCompanyId) : undefined;
        await loadUserLocationsForCompany(Number(filterUserId), cid);

        let rows = await readManifolds({ company_id: cid });
        const allowed = new Set(userLocations.map((l) => Number(l.id)));
        rows = rows.filter((r) => r.location_id && allowed.has(Number(r.location_id)));
        if (filterLocationId !== "") {
          rows = rows.filter((r) => Number(r.location_id) === Number(filterLocationId));
        }
        setItems(rows);
        return;
      }

      // B) sin usuario, con empresa (y opcional ubicación)
      if (filterCompanyId !== "") {
        const cid = Number(filterCompanyId);
        const lid = filterLocationId !== "" ? Number(filterLocationId) : undefined;
        const rows = await readManifolds({ company_id: cid, location_id: lid });
        setItems(rows);
        return;
      }

      // C) solo ubicación sin empresa (tomamos todas y filtramos por lid)
      if (filterLocationId !== "") {
        const rows = await readManifolds({});
        setItems(rows.filter((r) => Number(r.location_id) === Number(filterLocationId)));
        return;
      }

      // D) sin filtros → todos
      const rows = await readManifolds({});
      setItems(rows);
    } catch (e: any) {
      const msg =
        e?.response?.status === 403 || String(e).includes("403")
          ? "No tenés permiso para listar manifolds (habilitar GET /dirac/manifolds o permitir view en /dirac/admin/manifolds)"
          : e?.message || String(e);
      setErr(msg);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  // ------------- efectos -------------
  // init
  useEffect(() => {
    (async () => {
      await loadCompanies();
      await loadLocations();
      await load();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // al cambiar empresa → recarga locations y users
  useEffect(() => {
    (async () => {
      setCompanyUsers([]);
      setFilterUserId("");
      setFilterLocationId("");
      if (filterCompanyId === "") {
        await loadLocations();
        await load();
        return;
      }
      setLoadingUsers(true);
      try {
        const cid = Number(filterCompanyId);
        const us = await loadUsersForCompany(cid);
        setCompanyUsers(us);
        await loadLocations(cid);
      } catch (e: any) {
        setErr(e?.message || String(e));
      } finally {
        setLoadingUsers(false);
      }
      await load();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterCompanyId]);

  // al cambiar usuario → precargar ubicaciones del usuario + load
  useEffect(() => {
    (async () => {
      setFilterLocationId("");
      if (filterUserId !== "" && filterCompanyId !== "") {
        await loadUserLocationsForCompany(Number(filterUserId), Number(filterCompanyId));
      }
      await load();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterUserId]);

  // al cambiar ubicación puntual
  useEffect(() => {
    if (filterCompanyId !== "" || filterUserId !== "" || filterLocationId !== "") load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterLocationId]);

  // ---------- creación (igual patrón) ----------
  async function create() {
    setErr(null);
    try {
      const payload: any = { name: name.trim() };
      if (!payload.name) {
        setErr("Ingresá un nombre");
        return;
      }
      if (!loc) {
        setErr("Seleccioná ubicación");
        return;
      }
      if (loc.mode === "existing") {
        payload.location_id = loc.location_id;
      } else {
        if (!loc.company_id || !loc.location_name) {
          setErr("Empresa y nombre de ubicación requeridos");
          return;
        }
        payload.company_id = loc.company_id;
        payload.location_name = loc.location_name;
      }
      await postJSON("/dirac/admin/manifolds", payload);
      setName("");
      setLoc(undefined);
      await load();
    } catch (e: any) {
      const msg =
        e?.response?.status === 403 || String(e).includes("403")
          ? "No tenés permiso para crear manifolds (se requiere rol admin/owner)."
          : e?.message || String(e);
      setErr(msg);
    }
  }

  // -------- utilidades de UI (idéntico tono a otras páginas) --------
  const companiesById = useMemo(() => {
    const m = new Map<number, CompanyRow>();
    (companies || []).forEach((c) => m.set(c.id, c));
    return m;
  }, [companies]);

  const locationsById = useMemo(() => {
    const m = new Map<number, LocationRow>();
    (locations || []).forEach((l) => m.set(Number(l.id), l));
    return m;
  }, [locations]);

  const locationFilterOpts = useMemo(() => {
    let base: LocationRow[] = [];
    if (filterUserId !== "") base = userLocations;
    else if (filterCompanyId !== "")
      base = locations.filter((l) => Number(l.company_id) === Number(filterCompanyId));
    else base = locations;

    return base
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((l) => ({ id: l.id, label: `${l.name} #${l.id}` }));
  }, [userLocations, locations, filterCompanyId, filterUserId]);

  const userOpts = useMemo(
    () =>
      (companyUsers || [])
        .slice()
        .sort((a, b) => (a.full_name || a.email).localeCompare(b.full_name || b.email))
        .map((u) => ({
          id: u.id,
          label: u.full_name ? `${u.full_name} — ${u.email}` : u.email,
        })),
    [companyUsers]
  );

  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">Manifolds</h1>

      {/* Filtros (mismo bloque que Tanks/Valves) */}
      <Section title="Filtros" right={null}>
        <div className="flex flex-wrap items-end gap-3">
          {/* Empresa */}
          <div>
            <div className="text-xs text-slate-500">Empresa</div>
            <select
              className="border rounded px-2 py-1"
              value={filterCompanyId}
              onChange={(e) =>
                setFilterCompanyId(e.target.value === "" ? "" : Number(e.target.value))
              }
            >
              <option value="">(todas)</option>
              {companies
                .slice()
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} #{c.id}
                  </option>
                ))}
            </select>
          </div>

          {/* Usuario (asociado a empresa) */}
          <div>
            <div className="text-xs text-slate-500">
              Usuario {filterCompanyId !== "" && "(de la empresa seleccionada)"}
            </div>
            <select
              className="border rounded px-2 py-1 min-w-[16rem]"
              value={filterUserId}
              onChange={(e) => setFilterUserId(e.target.value === "" ? "" : Number(e.target.value))}
              disabled={filterCompanyId === "" || loadingUsers || userOpts.length === 0}
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
              <div className="text-xs text-slate-400 mt-1">Cargando usuarios…</div>
            )}
          </div>

          {/* Ubicación */}
          <div>
            <div className="text-xs text-slate-500">Ubicación</div>
            <select
              className="border rounded px-2 py-1 min-w-[14rem]"
              value={filterLocationId}
              onChange={(e) =>
                setFilterLocationId(e.target.value === "" ? "" : Number(e.target.value))
              }
              disabled={locationFilterOpts.length === 0 || loadingLocations}
              title={
                locationFilterOpts.length === 0
                  ? filterCompanyId !== ""
                    ? "La empresa no tiene ubicaciones"
                    : "No hay ubicaciones"
                  : ""
              }
            >
              <option value="">(todas)</option>
              {locationFilterOpts.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex gap-2">
            <button onClick={load} className="px-3 py-1.5 rounded bg-slate-900 text-white">
              Aplicar
            </button>
            <button
              onClick={async () => {
                setFilterCompanyId("");
                setFilterUserId("");
                setFilterLocationId("");
                setCompanyUsers([]);
                await loadLocations();
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

      {/* Crear (mismo patrón con LocationPicker) */}
      <Section title="Crear manifold" right={null}>
        <div className="flex items-end gap-3 flex-wrap">
          <div>
            <div className="text-xs text-slate-500">Nombre</div>
            <input
              className="border rounded px-2 py-1"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej. Colector Principal"
            />
          </div>
          <LocationPicker value={loc} onChange={(v) => setLoc(v)} />
          <button onClick={create} className="px-3 py-1.5 rounded bg-blue-600 text-white">
            Crear
          </button>
        </div>
      </Section>

      {/* Listado */}
      <Section
        title="Listado (click en la fila para editar)"
        right={loading ? <span className="text-xs text-slate-500">Cargando…</span> : null}
      >
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left">
              <th className="px-2 py-1">ID</th>
              <th className="px-2 py-1">Nombre</th>
              <th className="px-2 py-1">Ubicación</th>
              <th className="px-2 py-1">Empresa</th>
              <th className="px-2 py-1">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {items.map((m) => {
              const L = m.location_id ? locationsById.get(Number(m.location_id)) : undefined;
              const companyName =
                L?.company_id ? companiesById.get(Number(L.company_id))?.name : undefined;

              return (
                <tr
                  key={m.id}
                  className="border-t hover:bg-slate-50 cursor-pointer"
                  onClick={() => setEditing(m)}
                >
                  <td className="px-2 py-1">{m.id}</td>
                  <td className="px-2 py-1">{m.name}</td>
                  <td className="px-2 py-1">{L ? `${L.name} #${L.id}` : m.location_id ?? "—"}</td>
                  <td className="px-2 py-1">{companyName ?? (L?.company_id ?? "—")}</td>
                  <td className="px-2 py-1 space-x-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditing(m);
                      }}
                      className="text-blue-600 underline"
                    >
                      Editar
                    </button>
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        if (!confirm("¿Eliminar manifold?")) return;
                        try {
                          await del(`/dirac/admin/manifolds/${m.id}`);
                          await load();
                        } catch (e: any) {
                          setErr(e?.message || String(e));
                        }
                      }}
                      className="text-red-600 underline"
                    >
                      Eliminar
                    </button>
                  </td>
                </tr>
              );
            })}
            {items.length === 0 && (
              <tr>
                <td colSpan={5} className="px-2 py-6 text-center text-slate-500">
                  {loading ? "Cargando…" : "Sin manifolds"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Section>

      {/* Editor */}
      <SlideOver
        open={!!editing}
        title={editing ? `Editar manifold #${editing.id}` : ""}
        onClose={() => setEditing(null)}
      >
        {editing && (
          <ManifoldEditor
            row={editing}
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
