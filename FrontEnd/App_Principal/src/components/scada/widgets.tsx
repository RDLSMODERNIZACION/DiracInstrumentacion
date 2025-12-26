// src/components/scada/widgets.tsx
import React from "react";
import { Badge } from "./ui";
import { fmtLiters, sevMeta, severityOf } from "./utils";

export type ConnStatus = { online: boolean; ageSec: number; tone: "ok" | "warn" | "bad" };

/* --------------------------
   Fallback de conexión (WS/lecturas)
--------------------------- */
// Umbrales: primero específicos de WS; si no existen, usan staleness general
const WARN_SEC =
  Number((import.meta as any).env?.VITE_WS_WARN_SEC ?? (import.meta as any).env?.VITE_STALE_WARN_SEC ?? 120);
const CRIT_SEC =
  Number((import.meta as any).env?.VITE_WS_CRIT_SEC ?? (import.meta as any).env?.VITE_STALE_CRIT_SEC ?? 300);

function secSince(ts?: string | null) {
  if (!ts) return Number.POSITIVE_INFINITY;
  const t = new Date(ts).getTime();
  if (!isFinite(t)) return Number.POSITIVE_INFINITY;
  return Math.max(0, Math.round((Date.now() - t) / 1000));
}

/* =====================
   TankCard
===================== */

/**
 * TankCard (versión compacta 3D)
 * - Mantiene el mismo diseño visual
 * - prop `status`: { online, ageSec, tone }
 * - Si no viene `status`, se deriva de `tank.latest.ts` (igual que Faceplate)
 * - `signal`: "ok" | "warn" | "bad" (fallback visual adicional)
 */
export function TankCard({
  tank,
  onClick,
  signal = "ok",
  status,
}: {
  tank: any;
  onClick?: () => void;
  signal?: "ok" | "warn" | "bad";
  status?: ConnStatus;
}) {
  const sev = severityOf(tank.levelPct, tank.thresholds);
  const meta = sevMeta(sev);

  // valores seguros
  const level = typeof tank.levelPct === "number" && isFinite(tank.levelPct) ? tank.levelPct : null;
  const capacity = typeof tank.capacityL === "number" && isFinite(tank.capacityL) ? tank.capacityL : null;

  // volumen mostrado: usa el de la API si existe; si no, lo calcula
  const volume =
    typeof tank.volumeL === "number" && isFinite(tank.volumeL)
      ? tank.volumeL
      : level != null && capacity != null
      ? Math.round((capacity * level) / 100)
      : null;

  const pct = clampPct(level ?? 0);

  // ---- Conexión: WS o fallback por timestamp de última lectura ----
  const fallbackAge = secSince(tank?.latest?.ts);
  const fallbackTone: ConnStatus["tone"] = fallbackAge < WARN_SEC ? "ok" : fallbackAge < CRIT_SEC ? "warn" : "bad";
  const conn: ConnStatus =
    status ?? { online: fallbackAge < CRIT_SEC, ageSec: fallbackAge, tone: fallbackTone };

  // Dim por señal + status
  const tone = conn.tone ?? signal;
  const dimClass = tone === "bad" ? "filter grayscale opacity-60" : tone === "warn" ? "filter saturate-50 opacity-90" : "";

  return (
    <button
      onClick={onClick}
      className={`text-left p-4 bg-white border border-slate-200 rounded-2xl hover:shadow-lg transition w-full ${dimClass}`}
      aria-label={`Tanque ${tank.name}, nivel ${Math.round(pct)}% · ${fmtLiters(volume)} / ${fmtLiters(capacity)}`}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="font-medium text-slate-800">{tank.name}</div>
        <div className="flex items-center gap-2">
          {/* Pastilla de conexión (siempre, con WS o fallback) */}
          <Badge tone={conn.tone}>
            {conn.online ? `Online${Number.isFinite(conn.ageSec) ? ` · ${fmtAgoShort(conn.ageSec)}` : ""}` : "Offline"}
          </Badge>
          {/* Severidad por nivel */}
          <Badge tone={meta.tone}>{meta.label}</Badge>
        </div>
      </div>

      <div className="flex items-end gap-5">
        {/* === Tanque 3D compacto === */}
        <div className="relative">
          <div className="relative w-[95px] h-44 border-[6px] border-slate-200 rounded-[28px] bg-slate-50 overflow-hidden shadow-inner">
            {/* Material 3D */}
            <div className="pointer-events-none absolute inset-0 rounded-[28px]">
              <div className="absolute inset-0 rounded-[28px] [background:radial-gradient(ellipse_at_center,rgba(255,255,255,0.7)_0%,rgba(255,255,255,0.28)_38%,rgba(0,0,0,0.08)_85%)]" />
              <div className="absolute inset-0 rounded-[28px] [box-shadow:inset_0_18px_28px_rgba(0,0,0,0.10),inset_0_-12px_18px_rgba(0,0,0,0.08)]" />
              <div className="absolute inset-y-2 left-[45%] w-[10%] bg-white/35 blur-sm rounded-full" />
            </div>

            {/* Contenido líquido */}
            <div
              className="absolute bottom-0 left-0 right-0 will-change-[height]"
              style={{ height: `${pct}%`, transition: "height 800ms cubic-bezier(0.2,0.8,0.2,1)" }}
            >
              <div className="absolute inset-0 bg-gradient-to-t from-cyan-700 via-cyan-500 to-cyan-300" />
              <div className="absolute -top-3 left-0 w-[220%] h-6 animate-wave [--wave-speed:7s] text-white/70">
                <WaveSVG />
              </div>
              <div className="absolute -top-2 left-0 w-[220%] h-5 animate-wave [--wave-speed:5s] [animation-direction:reverse] text-white/50">
                <WaveSVG />
              </div>
              <div className="absolute -top-0.5 left-0 right-0 h-2 bg-white/60 rounded-full blur-[1px]" />
              <Bubbles count={16} />
            </div>
          </div>
          <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-[70px] h-3 bg-black/15 rounded-full blur-md" />
        </div>

        {/* Lecturas a la derecha */}
        <div className="flex-1 min-w-0">
          <div className="text-3xl font-semibold tabular-nums leading-none text-slate-800">{Math.round(pct)}%</div>
          <div className="text-xs text-slate-500 truncate">
            {fmtLiters(volume)} / {fmtLiters(capacity)}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes waveMove { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        .animate-wave { animation: waveMove var(--wave-speed,8s) linear infinite; }
        @keyframes bubble-rise {
          0% { transform: translateY(0) scale(0.7); opacity: 0; }
          10% { opacity: 0.6; }
          100% { transform: translateY(-115%) scale(1); opacity: 0; }
        }
      `}</style>
    </button>
  );
}

/* =====================
   PumpCard – Vertical Compact (FINITA + MISMO ALTO DEL TANQUE)
===================== */

export function PumpCard({
  pump,
  onClick,
  signal = "ok",
  status,
}: {
  pump: any;
  onClick?: () => void;
  signal?: "ok" | "warn" | "bad";
  status?: ConnStatus;
}) {
  const state: "run" | "stop" | undefined =
    pump?.state === "run" || pump?.state === "stop" ? pump.state : undefined;

  const ageSecFromRow =
    Number.isFinite(pump?.age_sec) ? Number(pump.age_sec) :
    Number.isFinite(pump?.ageSec) ? Number(pump.ageSec) : undefined;

  const onlineFromRow =
    typeof pump?.online === "boolean"
      ? pump.online
      : Number.isFinite(ageSecFromRow)
      ? (ageSecFromRow as number) < CRIT_SEC
      : false;

  const ts: string | null = pump?.hb_ts ?? pump?.event_ts ?? pump?.latest?.ts ?? null;

  const derivedAge = Number.isFinite(ageSecFromRow) ? (ageSecFromRow as number) : secSince(ts);
  const derivedTone: ConnStatus["tone"] = onlineFromRow ? "ok" : derivedAge < WARN_SEC ? "warn" : "bad";

  const conn: ConnStatus = status ?? {
    online: onlineFromRow,
    ageSec: derivedAge,
    tone: derivedTone,
  };

  const isOn = state === "run";
  const canSpin = Boolean(conn.online && isOn);
  const tone = conn.tone ?? signal;

  const ring =
    tone === "ok" ? "ring-emerald-300" : tone === "warn" ? "ring-amber-300" : "ring-rose-300";
  const dot =
    conn.online ? "bg-emerald-500" : tone === "warn" ? "bg-amber-500" : "bg-rose-500";

  const dimClass =
    tone === "bad" ? "grayscale opacity-60" : tone === "warn" ? "saturate-75" : "";

  const title = (pump?.name ?? "—").toString();

  return (
    <button
      onClick={onClick}
      className={[
        // 🔻 finita + misma altura visual del tanque (que es grande)
        // si tu grilla estira alturas por row, esto mantiene proporción y no se ve "gigante"
        "group relative w-full max-w-[150px] min-w-[140px]",
        "h-full", // deja que la grilla defina el alto (para igualarlo al tanque)
        "rounded-2xl border border-slate-200 bg-white",
        "px-2.5 py-2 text-left transition",
        "hover:shadow-md active:scale-[0.99]",
        dimClass,
      ].join(" ")}
      aria-label={`Bomba ${title}`}
    >
      {/* Glow sutil */}
      <div
        className={[
          "pointer-events-none absolute -top-8 -right-8 h-24 w-24 rounded-full blur-2xl",
          tone === "ok" ? "bg-emerald-200/35" : tone === "warn" ? "bg-amber-200/35" : "bg-rose-200/30",
        ].join(" ")}
      />

      {/* Layout vertical compacto */}
      <div className="relative z-10 flex h-full flex-col">
        {/* Top: Nombre */}
        <div className="mb-2">
          <div className="flex items-center gap-1">
            <span className={`inline-block h-2 w-2 rounded-full ${dot}`} />
            <div className="truncate text-[12px] font-semibold text-slate-900 leading-tight">
              {title}
            </div>
          </div>
        </div>

        {/* Centro: Impeller más protagonista */}
        <div className="flex flex-1 items-center justify-center">
          <div className="relative grid h-14 w-14 place-items-center">
            <div className={`absolute inset-0 rounded-full ring-2 ${ring}`} />
            <div className={`relative h-10 w-10 ${canSpin ? "text-emerald-500" : "text-slate-400"}`}>
              <Impeller spinning={canSpin} />
            </div>

            {!canSpin && (
              <span
                className="pointer-events-none absolute inset-0 grid place-items-center text-slate-400/70"
                title={!conn.online ? "Sin conexión" : "Apagada"}
              >
                <LockIcon className="h-4 w-4" />
              </span>
            )}
          </div>
        </div>

        {/* Bottom: Chips */}
        <div className="mt-2 flex items-center justify-between">
          <span
            className={[
              "rounded-full border px-2 py-0.5 text-[10px] font-semibold",
              conn.online
                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                : tone === "warn"
                ? "bg-amber-50 text-amber-700 border-amber-200"
                : "bg-rose-50 text-rose-700 border-rose-200",
            ].join(" ")}
          >
            {conn.online ? "Online" : "Offline"}
          </span>

          <span
            className={[
              "rounded-full border px-2 py-0.5 text-[10px] font-semibold",
              isOn ? "bg-slate-900 text-white border-slate-900" : "bg-slate-50 text-slate-600 border-slate-200",
            ].join(" ")}
          >
            {isOn ? "ON" : "OFF"}
          </span>
        </div>

        {/* Mini label opcional, muy discreto (no última conexión) */}
        <div className="mt-1 text-[10px] text-slate-500 text-right">
          {canSpin ? "Lista" : !conn.online ? "Sin conexión" : "Apagada"}
        </div>
      </div>

      <style>
        {`
          @keyframes rotate360 { to { transform: rotate(360deg); } }
          .impeller-spin { animation: rotate360 1.05s linear infinite; }
        `}
      </style>
    </button>
  );
}

/* =====================
   Compartidos
===================== */

function clampPct(n: number) {
  if (!isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

function fmtAgoShort(sec: number) {
  if (!isFinite(sec)) return "—";
  if (sec < 90) return `${sec | 0}s`;
  const m = Math.round(sec / 60);
  if (m < 90) return `${m}m`;
  const h = Math.round(sec / 3600);
  return `${h}h`;
}

function MetricTile({ label, value, suffix, children }: any) {
  return (
    <div className="rounded-xl border bg-slate-50/60 p-3">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="tabular-nums text-lg font-semibold text-slate-800">
        {value}
        {suffix ? <span className="ml-1 text-sm text-slate-500">{suffix}</span> : null}
      </div>
      {children}
    </div>
  );
}

function Bar({ pct, ariaLabel }: { pct: number; ariaLabel?: string }) {
  const p = Math.max(0, Math.min(100, pct));
  return (
    <div className="mt-2" aria-label={ariaLabel}>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
        <div
          className="h-full bg-gradient-to-r from-emerald-500 via-cyan-500 to-sky-500"
          style={{ width: `${p}%`, transition: "width 600ms ease" }}
        />
      </div>
      <div className="mt-1 text-[10px] text-slate-500">{Math.round(p)}%</div>
    </div>
  );
}

function Impeller({ spinning = false }: { spinning?: boolean }) {
  return (
    <svg viewBox="0 0 64 64" className={spinning ? "impeller-spin" : undefined}>
      <g fill="currentColor">
        <circle cx="32" cy="32" r="6" />
        <path d="M32 6a6 6 0 0 1 6 6c0 7-3 12-6 12s-6-5-6-12a6 6 0 0 1 6-6Z" />
        <path d="M58 32a6 6 0 0 1-6 6c-7 0-12-3-12-6s5-6 12-6a6 6 0 0 1 6 6Z" />
        <path d="M32 58a6 6 0 0 1-6-6c0-7 3-12 6-12s6 5 6 12a6 6 0 0 1-6 6Z" />
        <path d="M6 32a6 6 0 0 1 6-6c7 0 12 3 12 6s-5 6-12 6a6 6 0 0 1-6-6Z" />
      </g>
    </svg>
  );
}

function LockIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="4" y="10" width="16" height="10" rx="2" />
      <path d="M8 10V7a4 4 0 1 1 8 0v3" />
    </svg>
  );
}

// === Extras del Tank ===
function Bubbles({ count = 12 }: { count?: number }) {
  const items = Array.from({ length: count }).map((_, i) => {
    const left = ((i * 73) % 100) + Math.random() * 2 - 1;
    const size = 4 + (i % 6);
    const dur = 3.8 + ((i * 0.37) % 2.8);
    const delay = (i * 0.45) % 6;
    return { i, left, size, dur, delay };
  });

  return (
    <>
      {items.map(({ i, left, size, dur, delay }) => (
        <span
          key={i}
          className="absolute bottom-0 rounded-full bg-white/60 border border-white/30 shadow-sm"
          style={{
            left: `${left}%`,
            width: size,
            height: size,
            animation: `bubble-rise ${dur}s ease-in infinite`,
            animationDelay: `${delay}s`,
          }}
        />
      ))}
    </>
  );
}

function WaveSVG() {
  return (
    <svg viewBox="0 0 120 12" preserveAspectRatio="none" className="w-full h-full">
      <path d="M0 6 Q 10 0 20 6 T 40 6 T 60 6 T 80 6 T 100 6 T 120 6 V 12 H 0 Z" fill="currentColor" />
    </svg>
  );
}
