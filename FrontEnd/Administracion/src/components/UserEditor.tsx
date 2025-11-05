import React, { useEffect, useState } from "react";
import { useApi } from "../lib/api";
import Section from "./Section";

type Company = { company_id: number; name: string; role: string; is_primary: boolean };
type UserRow = { id: number; email: string; full_name?: string; status: string };
type LocationRow = { id: number; name: string };

export default function UserEditor({
  user,
  onClose,
  onSaved,
}: {
  user: UserRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { getJSON, postJSON, del, patchJSON } = useApi();

  const [fullName, setFullName] = useState(user.full_name ?? "");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Membresías del usuario
  const [companies, setCompanies] = useState<Company[]>([]);
  // Empresas para agregar
  const [allCompanies, setAllCompanies] = useState<Array<{ id: number; name: string }>>([]);
  const [addCompanyId, setAddCompanyId] = useState<number | "">("");
  const [addRole, setAddRole] = useState("viewer");

  // Gestión de localizaciones
  const [manageCompanyId, setManageCompanyId] = useState<number | "">("");
  const [companyLocations, setCompanyLocations] = useState<LocationRow[]>([]);
  const [explicitLocationIds, setExplicitLocationIds] = useState<number[]>([]);
  const [effectiveLocationIds, setEffectiveLocationIds] = useState<number[]>([]);

  async function load() {
    const cs: Company[] = await getJSON(`/dirac/admin/users/${user.id}/companies`);
    setCompanies(cs);
    if (!manageCompanyId && cs.length) setManageCompanyId(cs[0].company_id);

    const all = await getJSON("/dirac/admin/companies");
    setAllCompanies(all.map((x: any) => ({ id: x.id, name: x.name })));

    if (manageCompanyId) await loadLocationsForCompany(manageCompanyId as number);
  }

  async function loadLocationsForCompany(cid: number) {
    const locs = await getJSON(`/dirac/admin/locations?company_id=${cid}`);
    setCompanyLocations(locs.map((l: any) => ({ id: l.id, name: l.name })));

    const acc = await getJSON(`/dirac/admin/users/${user.id}/locations?company_id=${cid}`);
    const explicit = (acc.explicit ?? []).map((r: any) => r.location_id);
    const effective = (acc.effective ?? []).map((r: any) => r.location_id);
    setExplicitLocationIds(explicit);
    setEffectiveLocationIds(effective);
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);
  useEffect(() => { if (manageCompanyId) loadLocationsForCompany(manageCompanyId as number); }, [manageCompanyId]);

  async function saveProfile() {
    setSaving(true); setErr(null);
    try {
      await patchJSON(`/dirac/admin/users/${user.id}`, { full_name: fullName || null });
      if (password.trim()) {
        // endpoint simple para password del propio user; si no lo tenés, usá admin:
        await postJSON(`/dirac/users/${user.id}/password`, { new_password: password.trim() });
        setPassword("");
      }
      onSaved();
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setSaving(false);
    }
  }

  async function addMembership() {
    if (addCompanyId === "") return;
    await postJSON(`/dirac/admin/companies/${addCompanyId}/members`, { user_id: user.id, role: addRole, is_primary: false });
    setAddCompanyId(""); setAddRole("viewer");
    await load();
  }

  async function removeMembership(cid: number) {
    if (!confirm("¿Quitar al usuario de esta empresa?")) return;
    await del(`/dirac/admin/companies/${cid}/users/${user.id}`);
    if (manageCompanyId === cid) setManageCompanyId("");
    await load();
  }

  function isExplicit(id: number) { return explicitLocationIds.includes(id); }
  function isEffective(id: number) { return effectiveLocationIds.includes(id); }

  async function toggleExplicit(locId: number) {
    const checked = !explicitLocationIds.includes(locId);
    if (checked) {
      await postJSON(`/dirac/locations/${locId}/users/${user.id}`, { access: "control" }); // concede explícito
      setExplicitLocationIds(prev => [...new Set([...prev, locId])]);
    } else {
      await del(`/dirac/admin/users/${user.id}/locations/${locId}`); // quita explícito
      setExplicitLocationIds(prev => prev.filter(x => x !== locId));
    }
  }

  // 🔴 Eliminar usuario (forzado)
  async function deleteUser() {
    if (!confirm(`¿Eliminar definitivamente al usuario ${user.email}? Esto remueve membresías y accesos.`)) return;
    try {
      await del(`/dirac/admin/users/${user.id}?force=1`);
      onSaved();       // refrescá lista de usuarios del padre
      onClose();       // cerrá el editor
    } catch (e: any) {
      setErr(e?.message || String(e));
    }
  }

  const inCompanyIds = new Set(companies.map(c => c.company_id));

  return (
    <div className="space-y-6">
      {/* PERFIL */}
      <Section title="Perfil" right={
        <button onClick={deleteUser} className="text-red-600 underline">Eliminar usuario</button>
      }>
        <div className="space-y-3">
          <div className="text-sm"><b>Email:</b> {user.email}</div>
          <div>
            <div className="text-xs text-slate-500">Nombre completo</div>
            <input className="border rounded px-3 py-2 w-full"
              value={fullName}
              onChange={(e)=>setFullName(e.target.value)} />
          </div>
          <div>
            <div className="text-xs text-slate-500">Nueva contraseña (opcional)</div>
            <input className="border rounded px-3 py-2 w-full"
              value={password}
              onChange={(e)=>setPassword(e.target.value)}
              placeholder="••••"
              minLength={4} />
            <div className="text-xs text-slate-500 mt-1">
              Se usa HTTP Basic solo para pruebas. Requiere HTTPS.
            </div>
          </div>
          {err && <div className="text-sm text-red-600">{err}</div>}
          <div className="flex justify-end">
            <button onClick={saveProfile} disabled={saving}
              className="px-3 py-1.5 rounded bg-blue-600 text-white disabled:opacity-60">
              {saving ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </div>
      </Section>

      {/* MEMBRESÍAS */}
      <Section title="Empresas del usuario" right={null}>
        <div className="space-y-2">
          {companies.length === 0 && <div className="text-sm text-slate-500">Sin membresías</div>}
          {companies.map(c => (
            <div key={c.company_id} className="flex items-center justify-between border rounded px-3 py-2">
              <div>
                <div className="font-medium">{c.name} <span className="text-xs text-slate-500">#{c.company_id}</span></div>
                <div className="text-xs text-slate-500">Rol: {c.role}{c.is_primary ? " · primaria" : ""}</div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={()=>setManageCompanyId(c.company_id)} className="text-blue-600 underline">
                  Gestionar localizaciones
                </button>
                <button onClick={()=>removeMembership(c.company_id)} className="text-red-600 underline">
                  Quitar
                </button>
              </div>
            </div>
          ))}

          <div className="border-t pt-3 mt-3">
            <div className="text-xs text-slate-500 mb-1">Agregar a empresa</div>
            <div className="flex items-end gap-2 flex-wrap">
              <select className="border rounded px-2 py-1"
                value={addCompanyId}
                onChange={(e)=>setAddCompanyId(e.target.value === "" ? "" : Number(e.target.value))}
              >
                <option value="">(elegir)</option>
                {allCompanies.map(c => (
                  <option key={c.id} value={c.id} disabled={inCompanyIds.has(c.id)}>{c.name} #{c.id}</option>
                ))}
              </select>
              <select className="border rounded px-2 py-1" value={addRole} onChange={(e)=>setAddRole(e.target.value)}>
                <option value="viewer">viewer</option>
                <option value="technician">technician</option>
                <option value="operator">operator</option>
                <option value="admin">admin</option>
                <option value="owner">owner</option>
              </select>
              <button onClick={addMembership} className="px-3 py-1.5 rounded bg-slate-900 text-white">Agregar</button>
            </div>
          </div>
        </div>
      </Section>

      {/* LOCALIZACIONES explícitas */}
      {manageCompanyId !== "" && (
        <Section title={`Localizaciones (empresa #${manageCompanyId})`} right={null}>
          <div className="text-xs text-slate-500 mb-2">
            Tildás/destildás <b>accesos explícitos</b>. Si el rol de empresa ya otorga acceso,
            quitar el explícito <i>no</i> oculta la localización (el acceso heredado sigue vigente).
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {companyLocations.map(l => {
              const checked = isExplicit(l.id);
              const eff = isEffective(l.id);
              return (
                <label key={l.id} className="flex items-center gap-2 border rounded px-3 py-2">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleExplicit(l.id)}
                  />
                  <span className="text-sm">{l.name} <span className="text-xs text-slate-400">#{l.id}</span></span>
                  {eff && <span className="ml-auto text-[10px] text-slate-500">efectivo</span>}
                </label>
              );
            })}
          </div>
        </Section>
      )}

      <div className="flex justify-end">
        <button onClick={onClose} className="px-3 py-1.5 rounded bg-slate-200">Cerrar</button>
      </div>
    </div>
  );
}
