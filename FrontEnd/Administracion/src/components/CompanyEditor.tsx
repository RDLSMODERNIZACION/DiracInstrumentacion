// src/components/CompanyEditor.tsx
import React, { useEffect, useMemo, useState } from "react";
import Section from "./Section";
import { useApi } from "../lib/api";

type Company = { id: number; name: string; status?: string; legal_name?: string | null; cuit?: string | null };
type CompanyUserRow = {
  user_id: number;
  email: string;
  full_name?: string;
  role: "owner" | "admin" | "operator" | "technician" | "viewer";
  is_primary: boolean;
  status?: "active" | "disabled";
};
type UserLite = { id: number; email: string; full_name?: string; status: "active" | "disabled" };

export default function CompanyEditor({
  company,
  onSaved,
  onClose,
}: {
  company: Company;
  onSaved: () => void;
  onClose: () => void;
}) {
  const { getJSON, postJSON, patchJSON, del } = useApi();

  const [tab, setTab] = useState<"perfil" | "crear" | "usuarios">("perfil");
  const [name, setName] = useState(company.name);
  const [legalName, setLegalName] = useState(company.legal_name ?? "");
  const [cuit, setCuit] = useState(company.cuit ?? "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Usuarios de la empresa
  const [rows, setRows] = useState<CompanyUserRow[]>([]);

  // Crear usuario
  const [newEmail, setNewEmail] = useState("");
  const [newFullName, setNewFullName] = useState("");
  const [newPassword, setNewPassword] = useState("1234");
  const [newRole, setNewRole] = useState<CompanyUserRow["role"]>("viewer");

  // Edición en tabla Usuarios
  const [roleEdits, setRoleEdits] = useState<Record<number, CompanyUserRow["role"]>>({}); // por user_id
  const [statusEdits, setStatusEdits] = useState<Record<number, "active" | "disabled">>({}); // 'active'|'disabled'

  async function loadUsers() {
    // ▶️ endpoint admin que ya incluye status
    const r: CompanyUserRow[] = await getJSON(`/dirac/admin/companies/${company.id}/users`);
    setRows(r);

    // precargar selects desde la misma respuesta
    const roleMap: Record<number, CompanyUserRow["role"]> = {};
    const statusMap: Record<number, "active" | "disabled"> = {};
    for (const u of r) {
      roleMap[u.user_id] = u.role;
      statusMap[u.user_id] = (u.status as any) ?? "active";
    }
    setRoleEdits(roleMap);
    setStatusEdits(statusMap);
  }

  useEffect(() => {
    if (tab === "usuarios") loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  async function saveCompany() {
    setSaving(true);
    setErr(null);
    try {
      await patchJSON(`/dirac/admin/companies/${company.id}`, {
        name: name.trim() || null,
        legal_name: legalName.trim() || null,
        cuit: cuit.trim() || null,
      });
      onSaved();
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setSaving(false);
    }
  }

  async function deleteCompany(force = false) {
    setErr(null);
    try {
      await del(`/dirac/admin/companies/${company.id}?force=${force ? 1 : 0}`);
      onSaved();
      onClose();
    } catch (e: any) {
      setErr(e?.message || String(e));
    }
  }

  async function createUser() {
    setErr(null);
    try {
      // ✅ Crear y asignar a esta empresa en UN solo paso (endpoint abierto admin)
      await postJSON(`/dirac/admin/users`, {
        email: newEmail.trim(),
        full_name: newFullName.trim() || null,
        password: newPassword,
        status: "active",
        company_id: company.id,
        role: newRole, // 'viewer' | 'technician' | 'operator' | 'admin' | 'owner'
        is_primary: false,
      });

      setNewEmail("");
      setNewFullName("");
      setNewPassword("1234");
      setNewRole("viewer");
      await loadUsers();
      setTab("usuarios");
    } catch (e: any) {
      setErr(e?.message || String(e));
    }
  }

  async function applyRole(user_id: number) {
    try {
      const role = roleEdits[user_id];
      await postJSON(`/dirac/admin/companies/${company.id}/members`, { user_id, role, is_primary: false });
      await loadUsers();
    } catch (e: any) {
      setErr(e?.message || String(e));
    }
  }

  async function applyStatus(user_id: number) {
    try {
      const status = statusEdits[user_id]; // 'active'|'disabled'
      await patchJSON(`/dirac/admin/users/${user_id}`, { status });
      await loadUsers();
    } catch (e: any) {
      setErr(e?.message || String(e));
    }
  }

  async function removeFromCompany(user_id: number) {
    try {
      if (!confirm("¿Quitar usuario de esta empresa?")) return;
      await del(`/dirac/admin/companies/${company.id}/users/${user_id}`);
      await loadUsers();
    } catch (e: any) {
      setErr(e?.message || String(e));
    }
  }

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="flex items-center gap-2 border-b">
        {["perfil", "crear", "usuarios"].map((t) => (
          <button
            key={t}
            onClick={() => setTab(t as any)}
            className={
              "px-3 py-2 -mb-px border-b-2 " +
              (tab === t ? "border-slate-900 font-medium" : "border-transparent text-slate-500")
            }
          >
            {t === "perfil" ? "Perfil" : t === "crear" ? "Crear usuario" : "Usuarios"}
          </button>
        ))}
      </div>

      {tab === "perfil" && (
        <Section title={`Empresa #${company.id}`} right={null}>
          <div className="space-y-3">
            <div>
              <div className="text-xs text-slate-500">Nombre</div>
              <input className="border rounded px-3 py-2 w-full" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <div className="text-xs text-slate-500">Razón social (opcional)</div>
              <input
                className="border rounded px-3 py-2 w-full"
                value={legalName}
                onChange={(e) => setLegalName(e.target.value)}
              />
            </div>
            <div>
              <div className="text-xs text-slate-500">CUIT (opcional)</div>
              <input className="border rounded px-3 py-2 w-full" value={cuit} onChange={(e) => setCuit(e.target.value)} />
            </div>

            {err && <div className="text-sm text-red-600">{err}</div>}

            <div className="flex items-center justify-between">
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    if (confirm("¿Eliminar empresa? Solo se borrará si no tiene usuarios/ubicaciones/activos.")) {
                      deleteCompany(false);
                    }
                  }}
                  className="px-3 py-1.5 rounded bg-red-50 text-red-700 border border-red-200"
                >
                  Eliminar (si está vacía)
                </button>

                <button
                  onClick={() => {
                    if (
                      confirm(
                        "⚠️ FORZAR eliminación: se eliminarán ubicaciones, activos y membresías asociadas. ¿Continuar?"
                      )
                    ) {
                      deleteCompany(true);
                    }
                  }}
                  className="px-3 py-1.5 rounded bg-red-600 text-white"
                >
                  Forzar eliminación
                </button>
              </div>

              <button
                onClick={saveCompany}
                disabled={saving}
                className="px-3 py-1.5 rounded bg-blue-600 text-white disabled:opacity-60"
              >
                {saving ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </div>
        </Section>
      )}

      {tab === "crear" && (
        <Section title="Crear usuario y agregar a esta empresa" right={null}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <div className="text-xs text-slate-500">Email</div>
              <input
                className="border rounded px-3 py-2 w-full"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="usuario@example.com"
              />
            </div>
            <div>
              <div className="text-xs text-slate-500">Nombre (opcional)</div>
              <input
                className="border rounded px-3 py-2 w-full"
                value={newFullName}
                onChange={(e) => setNewFullName(e.target.value)}
                placeholder="Nombre Apellido"
              />
            </div>
            <div>
              <div className="text-xs text-slate-500">Contraseña</div>
              <input
                className="border rounded px-3 py-2 w-full"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                minLength={4}
              />
            </div>
            <div>
              <div className="text-xs text-slate-500">Rol</div>
              <select
                className="border rounded px-3 py-2 w-full"
                value={newRole}
                onChange={(e) => setNewRole(e.target.value as CompanyUserRow["role"])}
              >
                <option value="viewer">viewer</option>
                <option value="technician">technician</option>
                <option value="operator">operator</option>
                <option value="admin">admin</option>
                <option value="owner">owner</option>
              </select>
            </div>
          </div>

          {err && <div className="text-sm text-red-600 mt-2">{err}</div>}

          <div className="flex justify-end mt-3">
            <button onClick={createUser} className="px-3 py-1.5 rounded bg-slate-900 text-white">
              Crear y agregar
            </button>
          </div>
        </Section>
      )}

      {tab === "usuarios" && (
        <Section title="Usuarios de esta empresa" right={null}>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left">
                  <th className="px-2 py-1">Email</th>
                  <th className="px-2 py-1">Nombre</th>
                  <th className="px-2 py-1">Rol</th>
                  <th className="px-2 py-1">Estado</th>
                  <th className="px-2 py-1">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((u) => (
                  <tr key={u.user_id} className="border-t">
                    <td className="px-2 py-1">{u.email}</td>
                    <td className="px-2 py-1">{u.full_name ?? "—"}</td>
                    <td className="px-2 py-1">
                      <select
                        className="border rounded px-2 py-1"
                        value={roleEdits[u.user_id] ?? u.role}
                        onChange={(e) => setRoleEdits((prev) => ({ ...prev, [u.user_id]: e.target.value as any }))}
                      >
                        <option value="viewer">viewer</option>
                        <option value="technician">technician</option>
                        <option value="operator">operator</option>
                        <option value="admin">admin</option>
                        <option value="owner">owner</option>
                      </select>
                      <button className="ml-2 text-blue-600 underline" onClick={() => applyRole(u.user_id)}>
                        Guardar
                      </button>
                    </td>
                    <td className="px-2 py-1">
                      <select
                        className="border rounded px-2 py-1"
                        value={statusEdits[u.user_id] ?? u.status ?? "active"}
                        onChange={(e) => setStatusEdits((prev) => ({ ...prev, [u.user_id]: e.target.value as any }))}
                      >
                        <option value="active">active</option>
                        <option value="disabled">disabled</option>
                      </select>
                      <button className="ml-2 text-blue-600 underline" onClick={() => applyStatus(u.user_id)}>
                        Aplicar
                      </button>
                    </td>
                    <td className="px-2 py-1">
                      <button className="text-red-600 underline" onClick={() => removeFromCompany(u.user_id)}>
                        Quitar de empresa
                      </button>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-2 py-6 text-center text-slate-500">
                      Sin usuarios en esta empresa
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      <div className="flex justify-end">
        <button onClick={onClose} className="px-3 py-1.5 rounded bg-slate-200">
          Cerrar
        </button>
      </div>
    </div>
  );
}
