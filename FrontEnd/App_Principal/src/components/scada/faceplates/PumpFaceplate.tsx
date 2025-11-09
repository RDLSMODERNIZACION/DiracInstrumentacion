// src/components/scada/faceplates/PumpFaceplate.tsx
import React from "react";
import { Badge, KeyVal } from "../ui";
import { authHeaders } from "../../../lib/http";

type Tone = "ok" | "warn" | "bad";

/* ====== HTTP directo al backend ====== */
const API_BASE =
  (window as any).__API_BASE__ ||
  (import.meta as any).env?.VITE_API_BASE?.trim?.() ||
  "https://diracinstrumentacion.onrender.com";

async function postJSON(path: string, body: any) {
  const url = new URL(`${API_BASE}${path}`);
  const res = await fetch(url.toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...authHeaders(), // 👈 envía Authorization: Basic ... si hay login
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`POST ${path} -> ${res.status} ${res.statusText}${txt ? ` | ${txt}` : ""}`);
  }
  return res.json();
}

const ONLINE_DEAD_SEC = 60;

export function PumpFaceplate({
  pump,
  canControl = true, // ⬅️ nuevo: control habilitado sólo para owner/admin/operator (lo decide ScadaApp)
}: {
  pump: any;
  canControl?: boolean;
}) {
  const pumpNumId = pump.pumpId ?? pump.id;

  // Tipo de arranque (solo display)
  const driveType: "direct" | "soft" | "vfd" | null =
    pump.driveType ?? pump.drive_type ?? pump.config?.drive_type ?? null;

  const driveLabel =
    driveType === "vfd" ? "Variador (VFD)" : driveType === "soft" ? "Arranque suave" : "Directo";

  // Estado inicial desde props
  const initialState: "run" | "stop" = pump.state === "run" ? "run" : "stop";
  const [localState, setLocalState] = React.useState<"run" | "stop">(initialState);
  const [busy, setBusy] = React.useState<"START" | "STOP" | null>(null);
  const [note, setNote] = React.useState<string | null>(null);
  const [err, setErr] = React.useState<string | null>(null);

  // PIN de la bomba (4 dígitos, lo valida el backend)
  const [pin, setPin] = React.useState<string>("");

  // Online: prioridad backend; si no viene, usar age_sec <= 60
  const ageSec = Number.isFinite(pump?.age_sec)
    ? Number(pump.age_sec)
    : Number.isFinite(pump?.ageSec)
    ? Number(pump.ageSec)
    : NaN;
  const online: boolean =
    typeof pump?.online === "boolean"
      ? pump.online
      : Number.isFinite(ageSec)
      ? ageSec <= ONLINE_DEAD_SEC
      : false;

  // Sincronizar estado visual si cambia desde el backend y no estamos enviando
  React.useEffect(() => {
    if (!busy) {
      const incoming: "run" | "stop" = pump.state === "run" ? "run" : "stop";
      setLocalState(incoming);
    }
  }, [pump?.state, busy]);

  const tone: Tone = localState === "run" ? "ok" : "warn";

  const pinValid = /^\d{4}$/.test(pin);
  const canSend = online && pinValid && !busy && canControl;

  async function send(kind: "START" | "STOP") {
    setErr(null);
    setNote(null);

    if (!canControl) {
      setErr("Tu rol no puede operar bombas.");
      return;
    }
    if (!online) {
      setErr("No se puede operar: la bomba está offline.");
      return;
    }
    if (!pinValid) {
      setErr("Ingresá el PIN de 4 dígitos.");
      return;
    }

    setBusy(kind);

    // Optimistic UI
    setLocalState(kind === "START" ? "run" : "stop");

    try {
      // Endpoint con validación de permisos y PIN en backend
      await postJSON(`/dirac/pumps/${pumpNumId}/command`, {
        action: kind === "START" ? "start" : "stop",
        pin,
      });
      setNote("Comando enviado.");
    } catch (e: any) {
      // Revertir si falla
      setLocalState((prev) => (prev === "run" ? "stop" : "run"));
      setErr(e?.message || String(e));
    } finally {
      setBusy(null);
    }
  }

  // Handler del input (solo dígitos)
  const onPinChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value ?? "";
    const digitsOnly = raw.replace(/\D+/g, "");
    setPin(digitsOnly.slice(0, 4));
  };

  // Evitar que eventos de teclado/click burbujeen
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="text-lg font-semibold">{pump.name ?? `Bomba ${pumpNumId}`}</div>
        <div className="flex items-center gap-2">
          <Badge tone={online ? "ok" : "bad"}>{online ? "Online" : "Offline"}</Badge>
          <Badge tone={tone}>{localState === "run" ? "RUN" : "STOP"}</Badge>
        </div>
      </div>

      {/* Info básica */}
      <div className="p-4 bg-slate-50 rounded-xl text-sm">
        <div className="text-slate-500 mb-2">Configuración</div>
        <KeyVal k="Tipo de arranque" v={driveLabel} />
        <KeyVal k="Ubicación" v={pump?.location_name ?? pump?.locationName ?? "—"} />
      </div>

      {/* Autorización (PIN) */}
      <div className="p-4 bg-slate-50 rounded-xl">
        <div className="text-slate-500 mb-2">Autorización</div>
        <div className="flex items-center gap-3">
          <input
            value={pin}
            onChange={onPinChange}
            onKeyDown={stop}
            onMouseDown={stop}
            autoFocus
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder={canControl ? "PIN (4 dígitos)" : "Sin permisos para operar"}
            disabled={!canControl}
            className="w-40 text-center rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm outline-none disabled:bg-slate-100 disabled:text-slate-400 focus:ring-2 focus:ring-slate-300"
            title={!canControl ? "Tu rol no puede operar bombas" : ""}
          />
          {!online && <span className="text-xs text-slate-500">La bomba debe estar Online para operar.</span>}
          {!canControl && (
            <span className="text-xs text-slate-500">Permisos requeridos: owner / admin / operator.</span>
          )}
        </div>
      </div>

      {/* Comandos */}
      <div className="p-4 bg-slate-50 rounded-xl">
        <div className="text-slate-500 mb-2">Comandos</div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => send("START")}
            disabled={!canSend}
            className="px-3 py-1.5 rounded-xl bg-slate-900 text-white disabled:bg-slate-200 disabled:text-slate-400"
            title={
              !canControl
                ? "Tu rol no puede operar bombas"
                : !online
                ? "Requiere online"
                : !pinValid
                ? "Ingresá el PIN (4 dígitos)"
                : "Enviar START"
            }
          >
            {busy === "START" ? "…" : "START"}
          </button>
          <button
            type="button"
            onClick={() => send("STOP")}
            disabled={!canSend}
            className="px-3 py-1.5 rounded-xl bg-slate-200 disabled:opacity-50"
            title={
              !canControl
                ? "Tu rol no puede operar bombas"
                : !online
                ? "Requiere online"
                : !pinValid
                ? "Ingresá el PIN (4 dígitos)"
                : "Enviar STOP"
            }
          >
            {busy === "STOP" ? "…" : "STOP"}
          </button>
        </div>

        {err && (
          <div className="mt-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {err}
          </div>
        )}
        {note && !err && (
          <div className="mt-3 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
            {note}
          </div>
        )}
      </div>
    </div>
  );
}

export default PumpFaceplate;
