// src/components/scada/widgets.tsx
import React from "react";
import { Badge } from "./ui";
import { fmtLiters, sevMeta, severityOf } from "./utils";
import type { ServiceType } from "./hooks/usePlant"; // âœ… NUEVO (tipado del service_type)

export type ConnStatus = { online: boolean; ageSec: number; tone: "ok" | "warn" | "bad" };

/* --------------------------
   Fallback de conexiÃ³n (WS/lecturas)
--------------------------- */
// Umbrales: primero especÃ­ficos de WS; si no existen, usan staleness general
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
   Helpers service_type
===================== */

function normServiceType(x: any): ServiceType {
  const s = String(x ?? "").trim().toLowerCase();
  return s === "cloacas" ? "cloacas" : "agua";
}
function getServiceTypeFromTank(tank: any, fallback?: ServiceType): ServiceType {
  const st =
    tank?.service_type ??
    tank?.serviceType ??
    tank?.location?.service_type ??
    tank?.location?.serviceType ??
    tank?.loc?.service_type ??
    tank?.loc?.serviceType ??
    fallback;
  return normServiceType(st);
}

/* =====================
   TankCard
===================== */

export function TankCard({
  tank,
  onClick,
  signal = "ok",
  status,
  serviceType,
}: {
  tank: any;
  onClick?: () => void;
  signal?: "ok" | "warn" | "bad";
  status?: ConnStatus;
  serviceType?: ServiceType;
}) {
  const sev = severityOf(tank.levelPct, tank.thresholds);
  const meta = sevMeta(sev);

  const level =
    typeof tank.levelPct === "number" && isFinite(tank.levelPct)
      ? tank.levelPct
      : null;

  const pct = clampPct(level ?? 0);

  const fallbackAge = secSince(tank?.latest?.ts);
  const fallbackTone: ConnStatus["tone"] =
    fallbackAge < WARN_SEC
      ? "ok"
      : fallbackAge < CRIT_SEC
      ? "warn"
      : "bad";

  const conn: ConnStatus =
    status ?? {
      online: fallbackAge < CRIT_SEC,
      ageSec: fallbackAge,
      tone: fallbackTone,
    };

  const tone = conn.tone ?? signal;

  const dimClass =
    tone === "bad"
      ? "opacity-70"
      : tone === "warn"
      ? "opacity-90"
      : "";

  const st = getServiceTypeFromTank(tank, serviceType);

  const barClass =
    st === "cloacas"
      ? "from-emerald-700 via-emerald-500 to-emerald-300"
      : "from-sky-700 via-cyan-500 to-cyan-300";

  const alarmClass =
    sev === "critical"
      ? "border-red-200 bg-red-50 text-red-700"
      : sev === "warning"
      ? "border-amber-200 bg-amber-50 text-amber-700"
      : "border-slate-200 bg-slate-50 text-slate-500";

  return (
    <div
      className={[
        "w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-left xl:min-h-[150px]",
        "transition ",
        dimClass,
      ].join(" ")}
      aria-label={`Tanque ${tank.name}, nivel ${Math.round(pct)}%`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-bold text-slate-900">
            {tank.name}
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {!conn.online ? (
              <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-700">
                Sin comunicacion
              </span>
            ) : null}

            {meta.label !== "Normal" ? (
              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${alarmClass}`}>
                {meta.label}
              </span>
            ) : null}
          </div>
        </div>

        <div className="shrink-0 text-3xl font-black leading-none tabular-nums text-slate-950">
          {Math.round(pct)}%
        </div>
      </div>

      <div className="mt-3">
        <div className="relative h-5 overflow-hidden rounded-md border border-slate-300 bg-slate-100 shadow-inner">
          <div
            className={`absolute inset-y-0 left-0 bg-gradient-to-r ${barClass}`}
            style={{
              width: `${pct}%`,
              transition: "width 650ms cubic-bezier(0.2,0.8,0.2,1)",
            }}
          />

          {[25, 50, 75].map((mark) => (
            <div
              key={mark}
              className="pointer-events-none absolute inset-y-0 w-px bg-white/70"
              style={{ left: `${mark}%` }}
            />
          ))}
        </div>

        <div className="mt-1.5 flex justify-between text-[9px] font-semibold uppercase tracking-wide text-slate-400">
          <span>0</span>
          <span>25</span>
          <span>50</span>
          <span>75</span>
          <span>100%</span>
        </div>
      </div>
    </div>
  );
}
/* =====================
   PumpCard â€“ Vertical Compact
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
    pump?.state === "run" || pump?.state === "stop"
      ? pump.state
      : undefined;

  const ageSecFromRow =
    Number.isFinite(pump?.age_sec)
      ? Number(pump.age_sec)
      : Number.isFinite(pump?.ageSec)
      ? Number(pump.ageSec)
      : undefined;

  const onlineFromRow =
    typeof pump?.online === "boolean"
      ? pump.online
      : Number.isFinite(ageSecFromRow)
      ? (ageSecFromRow as number) < CRIT_SEC
      : false;

  const ts: string | null =
    pump?.hb_ts ?? pump?.event_ts ?? pump?.latest?.ts ?? null;

  const derivedAge = Number.isFinite(ageSecFromRow)
    ? (ageSecFromRow as number)
    : secSince(ts);

  const derivedTone: ConnStatus["tone"] =
    onlineFromRow
      ? "ok"
      : derivedAge < WARN_SEC
      ? "warn"
      : "bad";

  const conn: ConnStatus =
    status ?? {
      online: onlineFromRow,
      ageSec: derivedAge,
      tone: derivedTone,
    };

  const title = String(pump?.name ?? "Bomba");
  const isOn = state === "run";
  const available =
    typeof pump?.available === "boolean" ? pump.available : true;

  const availabilityType = String(
    pump?.availability_type ?? ""
  ).trim();

  const availabilityDescription = String(
    pump?.availability_description ?? ""
  ).trim();

  const runningHours = Number(pump?.running_hours_24h ?? 0);
  const starts24h = Number(pump?.starts_24h ?? 0);
  const nominalPower = Number(pump?.power_kw);

  const ledClass =
    !conn.online
      ? "bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.75)]"
      : !available
      ? "bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.65)]"
      : isOn
      ? "bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.75)]"
      : "bg-slate-500";

  const stateText =
    !conn.online
      ? "SIN COMUNICACION"
      : isOn
      ? "ENCENDIDA"
      : "APAGADA";

  const stateClass =
    !conn.online
      ? "text-rose-600"
      : isOn
      ? "text-emerald-600"
      : "text-slate-500";

  const availabilityLabel =
    !available
      ? availabilityType
        ? availabilityType.toUpperCase()
        : "NO DISPONIBLE"
      : "DISPONIBLE";

  const availabilityClass =
    !available
      ? "border-amber-300 bg-amber-50 text-amber-700"
      : "border-emerald-300 bg-emerald-50 text-emerald-700";

  return (
    <div
      className={[
        "group relative block w-full min-w-0 overflow-hidden rounded-xl border",
        "border-slate-200 bg-white px-3 py-3 text-left sm:px-3 sm:py-3 xl:px-3 xl:py-2.5",
        "shadow-sm",
        "transition",
      ].join(" ")}
      aria-label={`Bomba ${title}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5">
            <span
              className={`h-2.5 w-2.5 shrink-0 rounded-full border border-black/20 ${ledClass}`}
            />
            <div className="truncate font-mono text-[14px] font-black tracking-wide text-slate-900 sm:text-[15px]">
              {title}
            </div>
          </div>

          <div className={`mt-2 font-mono text-[13px] font-bold tracking-[0.08em] sm:text-[14px] ${stateClass}`}>
            {stateText}
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          <span
            className={[
              "rounded-md border px-2.5 py-1 font-mono text-[10px] font-black tracking-wide",
              availabilityClass,
            ].join(" ")}
          >
            {availabilityLabel}
          </span>

          <span className="hidden">
            &gt;
          </span>
        </div>
      </div>

      <div className="my-2.5 h-px bg-slate-200" />

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[10px] font-semibold text-slate-500 sm:text-[11px]">
        <span>{runningHours.toFixed(1)} h / 24h</span>
        <span className="text-slate-600">|</span>
        <span>{Math.round(starts24h)} arr.</span>

        {Number.isFinite(nominalPower) && nominalPower > 0 ? (
          <>
            <span className="text-slate-600">|</span>
            <span>{nominalPower.toFixed(0)} kW nom.</span>
          </>
        ) : null}
      </div>

      {!available && availabilityDescription ? (
        <div className="mt-2 truncate font-mono text-[11px] text-amber-700">
          {availabilityDescription}
        </div>
      ) : null}
    </div>
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
  if (!isFinite(sec)) return "â€”";
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

