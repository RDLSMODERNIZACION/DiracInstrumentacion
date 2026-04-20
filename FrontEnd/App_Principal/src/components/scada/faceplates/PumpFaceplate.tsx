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
      ...authHeaders(),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`POST ${path} -> ${res.status} ${res.statusText}${txt ? ` | ${txt}` : ""}`);
  }
  return res.json();
}

const ONLINE_DEAD_SEC = 180;

function fmtNum(v: any, unit = "", decimals = 0) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return `${n.toLocaleString("es-AR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}${unit ? ` ${unit}` : ""}`;
}

function normText(v: any) {
  if (v == null) return "—";
  const s = String(v).trim();
  return s ? s : "—";
}

export function PumpFaceplate({
  pump,
  canControl = true,
}: {
  pump: any;
  canControl?: boolean;
}) {
  const pumpNumId = pump.pumpId ?? pump.id;

  // tipo de arranque: priorizamos el nuevo campo del backend
  const startTypeRaw =
    pump.start_type ??
    pump.startType ??
    pump.driveType ??
    pump.drive_type ??
    pump.config?.drive_type ??
    null;

  const startTypeKey = String(startTypeRaw ?? "").trim().toLowerCase();

  const startTypeLabel =
    startTypeKey === "vfd" || startTypeKey === "variador"
      ? "Variador (VFD)"
      : startTypeKey === "soft" ||
        startTypeKey === "softstarter" ||
        startTypeKey === "soft_starter" ||
        startTypeKey === "arranque suave"
      ? "Arranque suave"
      : startTypeKey === "estrella-triangulo" ||
        startTypeKey === "estrella triangulo" ||
        startTypeKey === "star-delta"
      ? "Estrella-triángulo"
      : startTypeKey === "direct" ||
        startTypeKey === "directo" ||
        startTypeKey === "dol"
      ? "Directo"
      : normText(startTypeRaw);

  const initialState: "run" | "stop" = pump.state === "run" ? "run" : "stop";
  const [localState, setLocalState] = React.useState<"run" | "stop">(initialState);
  const [busy, setBusy] = React.useState<"START" | "STOP" | null>(null);
  const [note, setNote] = React.useState<string | null>(null);
  const [err, setErr] = React.useState<string | null>(null);

  const [pin, setPin] = React.useState<string>("");

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

    setLocalState(kind === "START" ? "run" : "stop");

    try {
      await postJSON(`/dirac/pumps/${pumpNumId}/command`, {
        action: kind === "START" ? "start" : "stop",
        pin,
      });
      setNote("Comando enviado.");
    } catch (e: any) {
      setLocalState((prev) => (prev === "run" ? "stop" : "run"));
      setErr(e?.message || String(e));
    } finally {
      setBusy(null);
    }
  }

  const onPinChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value ?? "";
    const digitsOnly = raw.replace(/\D+/g, "");
    setPin(digitsOnly.slice(0, 4));
  };

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
        <div className="space-y-1 divide-y divide-slate-200/60">
          <KeyVal k="Tipo de arranque" v={startTypeLabel} />
          <KeyVal k="Ubicación" v={pump?.location_name ?? pump?.locationName ?? "—"} />
        </div>
      </div>

      {/* Ficha técnica */}
      <div className="p-4 bg-slate-50 rounded-xl text-sm">
        <div className="text-slate-500 mb-2">Ficha técnica</div>
        <div className="space-y-1 divide-y divide-slate-200/60">
          <KeyVal k="Marca" v={normText(pump?.brand)} />
          <KeyVal k="Modelo" v={normText(pump?.model)} />
          <KeyVal k="N° de serie" v={normText(pump?.serial_number)} />
          <KeyVal k="Año de instalación" v={pump?.install_year ?? pump?.installYear ?? "—"} />
          <KeyVal k="Tipo de bomba" v={normText(pump?.pump_type ?? pump?.pumpType)} />
          <KeyVal k="Tipo de arranque" v={startTypeLabel} />
          <KeyVal k="Potencia" v={fmtNum(pump?.power_kw, "kW", 2)} />
          <KeyVal k="Tensión" v={fmtNum(pump?.voltage_v, "V", 0)} />
          <KeyVal k="Caudal nominal" v={fmtNum(pump?.flow_nominal_m3h, "m³/h", 2)} />
          <KeyVal k="Altura nominal" v={fmtNum(pump?.head_nominal_mca, "mca", 2)} />
          <KeyVal k="Criticidad" v={normText(pump?.criticality)} />
        </div>
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