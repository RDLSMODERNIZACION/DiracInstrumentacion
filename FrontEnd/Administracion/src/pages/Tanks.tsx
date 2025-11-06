// src/pages/Tanks.tsx
import React, { useEffect, useMemo, useState } from "react";
import Section from "../components/Section";
import { useApi } from "../lib/api";
import LocationPicker from "../components/LocationPicker";
import SlideOver from "../components/SlideOver";
import AssetEditor from "../components/AssetEditor";

type Tank = { id: number; name: string; location_id?: number | null };
type CompanyRow = { id: number; name: string; status?: string };
type LocationRow = { id: number; name: string; company_id?: number | null };
type UserRow = { id: number; email: string; full_name?: string | null };

type LocValue =
  | { mode: "existing"; company_id: number; location_id: number }
  | { mode: "new"; company_id: number; location_name: string };

export default function Tanks() {
  const { getJSON, postJSON, del } = useApi();

  // Listado
  const [items, setItems] = useState<Tank[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Crear
  const [name, setName] = useState("");
  const [loc, setLoc] = useState<LocValue | undefined>(undefined);

  // Filtros
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [companyUsers, setCompanyUsers] = useState<UserRow[]>([]);
  const [userLocations, setUserLocations] = useState<LocationRow[]>([]);

  const [filterCompanyId, setFilterCompanyId] = useState<number | "">("");
  const [filterUserId, setFilterUserId] = useState<number | "">("");
  const [filterLocationId, setFilterLocationId] = useState<number | "">("");

  const [loadingUsers, setLoadingUsers] = useState(false);
  const [loadingLocations, setLoadingLocations] = useState(false);
  const [editing, setEditing] = useState<Tank | null>(null);

  // ---------------- Helpers de carga ----------------

  async function loadCompanies() {
    const rows: CompanyRow[] = await getJSON("/dirac/admin/companies");
    setCompanies(rows || []);
  }

  async function loadLocations(companyId?: number) {
    setLoadingLocations(true);
    try {
      if (companyId) {
        const rows: LocationRow[] = await getJSON(
          `/dirac/admin/locations?company_id=${companyId}`
        );
        setLocations(rows || []);
      } else {
        const rows: LocationRow[] = await getJSON("/dirac/admin/locations");
        setLocations(rows || []);
      }
    } finally {
      setLoadingLocations(false);
    }
  }

  async function loadUsersForCompany(companyId: number) {
    setLoadingUsers(true);
    try {
      try {
        const rows: UserRow[] = await getJSON(
          `/dirac/admin/users?company_id=${companyId}`
        );
        setCompanyUsers(rows || []);
        return;
      } catch {
        const rows: UserRow[] = await getJSON(
          `/dirac/admin/companies/${companyId}/users`
        );
        setCompanyUsers(rows || []);
      }
    } catch {
      setCompanyUsers([]);
    } finally {
      setLoadingUsers(false);
    }
  }

  async function loadUserLocationsForCompany(userId: number, companyId?: number) {
    const qs = companyId ? `?company_id=${companyId}` : "";
    try {
      const acc = await getJSON(`/dirac/admin/users/${userId}/locations${qs}`);
      const effective = Array.isArray(acc?.effective) ? acc.effective : [];
      const explicit = Array.isArray(acc?.explicit) ? acc.explicit : [];
      const merged = [...effective, ...explicit];

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

  // *** Lector robusto: intenta /dirac/tanks (view) y cae a /dirac/admin/tanks ***
  async function readTanks(params: {
    company_id?: number;
    location_id?: number;
  }): Promise<Tank[]> {
    const qs = new URLSearchParams();
    if (params.company_id) qs.set("company_id", String(params.company_id));
    if (params.location_id) qs.set("location_id", String(params.location_id));
    const suffix = qs.toString() ? `?${qs.toString()}` : "";

    // 1) ruta “view”
    try {
      const rows: Tank[] = await getJSON(`/dirac/tanks${suffix}`);
      return Array.isArray(rows) ? rows : [];
    } catch (e: any) {
      // 2) fallback admin (puede dar 403 si no sos admin)
      try {
        const rows: Tank[] = await getJSON(`/dirac/admin/tanks${suffix}`);
        return Array.isArray(rows) ? rows : [];
      } catch (e2: any) {
        // Propago el error más reciente
        throw e2 ?? e;
      }
    }
  }

  // ---------------- Carga con filtros ----------------

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      // A) Con usuario seleccionado → sólo tanques en ubicaciones a las que ese usuario accede (dentro de la empresa si la hay)
      if (filterUserId !== "") {
        const cid = filterCompanyId !== "" ? Number(filterCompanyId) : undefined;
        await loadUserLocationsForCompany(Number(filterUserId), cid);

        let tanks = await readTanks({ company_id: cid });

        // Filtramos por ubicaciones permitidas del usuario
        const allowed = new Set(userLocations.map((l) => Number(l.id)));
        tanks = tanks.filter(
          (t) => t.location_id && allowed.has(Number(t.location_id))
        );

        if (filterLocationId !== "") {
          tanks = tanks.filter(
            (t) => Number(t.location_id) === Number(filterLocationId)
          );
        }

        setItems(tanks);
        return;
      }

      // B) Sin usuario, pero con empresa (y opcional ubicación)
      if (filterCompanyId !== "") {
        const cid = Number(filterCompanyId);
        const lid = filterLocationId !== "" ? Number(filterLocationId) : undefined;
        const tanks = await readTanks({ company_id: cid, location_id: lid });
        setItems(tanks);
        return;
      }

      // C) Sin filtros → todo lo que el usuario autenticado puede ver
      const tanks = await readTanks({});
      setItems(tanks);
    } catch (e: any) {
      const msg =
        e?.response?.status === 403 || String(e).includes("403")
          ? "No tenés permiso para listar tanques en este backend. (Sugerencia: habilitar GET /dirac/tanks o permitir view en /dirac/admin/tanks)"
          : e?.message || String(e);
      setErr(msg);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  // ---------------- Efectos ----------------

  useEffect(() => {
    loadCompanies();
    loadLocations();
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Al cambiar empresa: reseteo usuario/ubicación y cargo data ligada
  useEffect(() => {
    (async () => {
      setCompanyUsers([]);
      setUserLocations([]);
      setFilterUserId("");
      setFilterLocationId("");
      if (filterCompanyId !== "") {
        const cid = Number(filterCompanyId);
        await Promise.all([loadUsersForCompany(cid), loadLocations(cid)]);
      } else {
        await loadLocations();
      }
      await load();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterCompanyId]);

  // Al cambiar usuario: recargo ubicaciones accesibles y refresco
  useEffect(() => {
    (async () => {
      setUserLocations([]);
      setFilterLocationId("");
      if (filterUserId !== "" && filterCompanyId !== "") {
        await loadUserLocationsForCompany(
          Number(filterUserId),
          Number(filterCompanyId)
        );
      }
      await load();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterUserId]);

  // Al cambiar ubicación puntual
  useEffect(() => {
    if (filterCompanyId !== "" || filterUserId !== "" || filterLocationId !== "")
      load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterLocationId]);

  // ---------------- Crear / Borrar ----------------

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
        payload.company_id = loc.company_id;
        payload.location_name = loc.location_name;
      }

      // Crear es admin
      await postJSON("/dirac/admin/tanks", payload);
      setName("");
      setLoc(undefined);
      await load();
    } catch (e: any) {
      const msg =
        e?.response?.status === 403 || String(e).includes("403")
          ? "No tenés permiso para crear tanques (se requiere rol admin/owner)."
          : e?.message || String(e);
      setErr(msg);
    }
  }

  async function remove(id: number) {
    if (!confirm("¿Eliminar tanque?")) return;
    try {
      await del(`/dirac/admin/tanks/${id}`);
      await load();
    } catch (e: any) {
      const msg =
        e?.response?.status === 403 || String(e).includes("403")
          ? "No tenés permiso para borrar tanques."
          : e?.message || String(e);
      setErr(msg);
    }
  }

  // ---------------- Memos para selects ----------------

  const companyOpts = useMemo(
    () =>
      (companies || [])
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((c) => ({ id: c.id, label: `${c.name} #${c.id}` })),
    [companies]
  );

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
      base = locations.filter(
        (l) => Number(l.company_id) === Number(filterCompanyId)
      );
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
        .sort((a, b) =>
          (a.full_name || a.email).localeCompare(b.full_name || b.email)
        )
        .map((u) => ({
          id: u.id,
          label: u.full_name ? `${u.full_name} — ${u.email}` : u.email,
        })),
    [companyUsers]
  );

  // ---------------- UI ----------------

  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">Tanques</h1>

      {/* Filtros */}
      <Section title="Filtros" right={null}>
        <div className="flex flex-wrap items-end gap-3">
          {/* Empresa */}
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

          {/* Usuario (de la empresa) */}
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
          </div>

          {/* Ubicación */}
          <div>
            <div className="text-xs text-slate-500">Ubicación</div>
            <select
              className="border rounded px-2 py-1 min-w-[14rem]"
              value={filterLocationId}
              onChange={(e) =>
                setFilterLocationId(
                  e.target.value === "" ? "" : Number(e.target.value)
                )
              }
              disabled={locationFilterOpts.length === 0 || loadingLocations}
              title={
                locationFilterOpts.length === 0
                  ? "No hay ubicaciones para el filtro actual"
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
                setFilterLocationId("");
                setCompanyUsers([]);
                setUserLocations([]);
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

      {/* Crear */}
      <Section title="Crear tanque" right={null}>
        <div className="flex flex-col gap-3">
          <div className="flex items-end gap-2 flex-wrap">
            <div>
              <div className="text-xs text-slate-500">Nombre</div>
              <input
                className="border rounded px-2 py-1"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej. Tanque Principal"
              />
            </div>
          </div>

          <LocationPicker value={loc} onChange={setLoc} />

          <div>
            <button
              onClick={create}
              className="px-3 py-1.5 rounded bg-blue-600 text-white"
            >
              Crear
            </button>
          </div>
        </div>
      </Section>

      {/* Listado */}
      <Section
        title="Listado (click en la fila para editar)"
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
              <th className="px-2 py-1">Ubicación</th>
              <th className="px-2 py-1">Empresa</th>
              <th className="px-2 py-1">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {items.map((t) => {
              const L = t.location_id
                ? locationsById.get(Number(t.location_id))
                : undefined;
              const companyName = L?.company_id
                ? companiesById.get(Number(L.company_id))?.name
                : undefined;
              return (
                <tr
                  key={t.id}
                  className="border-t hover:bg-slate-50 cursor-pointer"
                  onClick={() => setEditing(t)}
                >
                  <td className="px-2 py-1">{t.id}</td>
                  <td className="px-2 py-1">{t.name}</td>
                  <td className="px-2 py-1">
                    {L ? `${L.name} #${L.id}` : t.location_id ?? "—"}
                  </td>
                  <td className="px-2 py-1">
                    {companyName ?? (L?.company_id ?? "—")}
                  </td>
                  <td
                    className="px-2 py-1 space-x-2"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      onClick={() => remove(t.id)}
                      className="text-red-600 underline"
                    >
                      Borrar
                    </button>
                  </td>
                </tr>
              );
            })}
            {items.length === 0 && (
              <tr>
                <td colSpan={5} className="px-2 py-6 text-center text-slate-500">
                  {loading ? "Cargando…" : "Sin tanques"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Section>

      <SlideOver
        open={!!editing}
        title={editing ? `Editar tanque #${editing.id}` : ""}
        onClose={() => setEditing(null)}
      >
        {editing && (
          <AssetEditor
            kind="tank"
            item={editing}
            onSaved={async () => {
              setEditing(null);
              await load();
            }}
            onCancel={() => setEditing(null)}
          />
        )}
      </SlideOver>
    </div>
  );
}
