// src/components/scada/faceplates/PumpFaceplate.tsx
import React from "react";
import { Badge, KeyVal } from "../ui";

type Tone = "ok" | "warn" | "bad";

/* ====== HTTP directo al backend ====== */
const API_BASE =
  (window as any).__API_BASE__ ||
  (import.meta as any).env?.VITE_API_BASE?.trim?.() ||
  "https://backend-v85n.onrender.com";

async function postJSON(path: string, body: any) {
  const url = new URL(`${API_BASE}${path}`);
  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`POST ${path} -> ${res.status} ${res.statusText}${txt ? ` | ${txt}` : ""}`);
  }
  return res.json();
}

const ONLINE_DEAD_SEC = 60;

export function PumpFaceplate({ pump }: { pump: any }) {
  const pumpNumId = pump.pumpId ?? pump.id;

  // Tipo de arranque (solo display)
  const driveType: "direct" | "soft" | "vfd" | null =
    pump.driveType ?? pump.drive_type ?? pump.config?.drive_type ?? null;

  const driveLabel =
    driveType === "vfd"
      ? "Variador (VFD)"
      : driveType === "soft"
      ? "Arranque suave"
      : "Directo";

  // Estado inicial desde props
  const initialState: "run" | "stop" = pump.state === "run" ? "run" : "stop";
  const [localState, setLocalState] = React.useState<"run" | "stop">(initialState);
  const [busy, setBusy] = React.useState<"START" | "STOP" | null>(null);
  const [note, setNote] = React.useState<string | null>(null);
  const [err, setErr] = React.useState<string | null>(null);

  // “Contraseña” (debe ser exactamente 1234 para habilitar comandos)
  const [pass, setPass] = React.useState<string>("");

  // Online: prioridad backend; si no viene, usar age_sec <= 60
  const ageSec = Number.isFinite(pump?.age_sec)
    ? Number(pump.age_sec)
    : Number.isFinite(pump?.ageSec)
    ? Number(pump.ageSec)
    : NaN;
  const online: boolean =
    typeof pump?.online === "boolean" ? pump.online : (Number.isFinite(ageSec) ? ageSec <= ONLINE_DEAD_SEC : false);

  // Sincronizar estado visual si cambia desde el backend y no estamos enviando
  React.useEffect(() => {
    if (!busy) {
      const incoming: "run" | "stop" = pump.state === "run" ? "run" : "stop";
      setLocalState(incoming);
    }
  }, [pump?.state, busy]);

  const tone: Tone = localState === "run" ? "ok" : "warn";

  const passOk = pass === "1234";
  const canSend = online && passOk && !busy;

  async function send(kind: "START" | "STOP") {
    setErr(null);
    setNote(null);

    if (!online) {
      setErr("No se puede operar: la bomba está offline.");
      return;
    }
    if (!passOk) {
      setErr("Ingresá la autorización correcta.");
      return;
    }

    setBusy(kind);

    // Optimistic UI
    setLocalState(kind === "START" ? "run" : "stop");

    try {
      await postJSON("/arduino-controler/command", {
        pump_id: pumpNumId,
        action: kind === "START" ? "start" : "stop",
        user: "operador",
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

  // Handler del input: permitir cualquier cantidad de dígitos, filtrando no-numéricos.
  const onPassChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value ?? "";
    // solo dígitos
    const digitsOnly = raw.replace(/\D+/g, "");
    setPass(digitsOnly);
  };

  // Evitar que eventos de teclado/click burbujeen y “saquen” el foco
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

      {/* Autorización (input multi-dígito; clave válida: 1234) */}
      <div className="p-4 bg-slate-50 rounded-xl">
        <div className="text-slate-500 mb-2">Autorización</div>
        <div className="flex items-center gap-3">
          <input
            value={pass}
            onChange={onPassChange}
            onKeyDown={stop}
            onMouseDown={stop}
            autoFocus
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder=""
            className="w-28 text-center rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-slate-300"
          />
          {!online && <span className="text-xs text-slate-500">La bomba debe estar Online para operar.</span>}
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
            title={!online ? "Requiere online" : !passOk ? "Autorización inválida" : "Enviar START"}
          >
            {busy === "START" ? "…" : "START"}
          </button>
          <button
            type="button"
            onClick={() => send("STOP")}
            disabled={!canSend}
            className="px-3 py-1.5 rounded-xl bg-slate-200 disabled:opacity-50"
            title={!online ? "Requiere online" : !passOk ? "Autorización inválida" : "Enviar STOP"}
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
