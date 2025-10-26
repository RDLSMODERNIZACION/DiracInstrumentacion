// src/components/scada/faceplates/TankFaceplate.tsx
import React from "react";
import { Badge, KeyVal } from "../ui";
import { fmtLiters, sevMeta, severityOf } from "../utils";

const DEFAULT_THRESHOLDS = { lowCritical: 10, lowWarning: 25, highWarning: 80, highCritical: 90 };
const toPct = (n: any) => (typeof n === "number" && isFinite(n) ? n : 0);

// Umbrales de “online” (primero WS, si no hay usa staleness)
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
function fmtAgo(sec: number) {
  if (!isFinite(sec)) return "—";
  if (sec < 90) return `${sec}s`;
  const m = Math.round(sec / 60);
  if (m < 90) return `${m}m`;
  const h = Math.round(sec / 3600);
  return `${h}h`;
}

type ConnTone = "ok" | "warn" | "bad";
type Status = { online: boolean; ageSec: number; tone: ConnTone };

export function TankFaceplate({
  tank,
  headerless = false,
  status, // 👈 opcional: { online, ageSec, tone }
}: {
  tank: any;
  headerless?: boolean;
  status?: Status;
}) {
  const sev = severityOf(tank.levelPct, tank.thresholds || DEFAULT_THRESHOLDS);
  const meta = sevMeta(sev);
  const th = tank.thresholds || DEFAULT_THRESHOLDS;

  // ── Estado de conexión ─────────────────────────────────
  const fallbackAge = secSince(tank?.latest?.ts);
  const derivedTone: ConnTone =
    fallbackAge < WARN_SEC ? "ok" : fallbackAge < CRIT_SEC ? "warn" : "bad";
  const derived: Status = {
    online: fallbackAge < CRIT_SEC,
    ageSec: fallbackAge,
    tone: derivedTone,
  };
  const conn: Status = status ?? derived;
  const connLabel = conn.online ? "Online" : "Offline";
  const connAge = isFinite(conn.ageSec) ? ` · ${fmtAgo(conn.ageSec)}` : "";

  // Etiquetas legibles
  const materialLabel = (() => {
    const raw = tank?.material ?? null;
    if (!raw) return "—";
    const map: Record<string, string> = {
      hormigon: "Hormigón",
      concreto: "Hormigón",
      acero: "Acero",
      inox: "Acero inoxidable",
      frp: "FRP",
      hdpe: "HDPE",
    };
    const key = String(raw).toLowerCase();
    return map[key] ?? String(raw);
  })();
  const fluidLabel = tank?.fluid ?? "—";
  const installYearLabel = tank?.install_year ?? tank?.installYear ?? "—";
  const locationLabel = tank?.location_text ?? tank?.locationText ?? "—";

  return (
    <div className="p-4">
      {/* Header local (cuando headerless=false) */}
      {!headerless && (
        <div className="flex items-center justify-between mb-3">
          <div className="text-lg font-semibold">{tank.name}</div>
          <div className="flex items-center gap-2">
            <Badge tone={conn.tone}>{connLabel + connAge}</Badge>
            <Badge tone={meta.tone}>{meta.label}</Badge>
          </div>
        </div>
      )}

      {/* Cuando viene headerless (desde Drawer), mostramos la pill de conexión arriba */}
      {headerless && (
        <div className="flex items-center justify-end mb-2">
          <Badge tone={conn.tone}>{connLabel + connAge}</Badge>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        {/* Nivel */}
        <div className="p-4 bg-slate-50 rounded-xl">
          <div className="text-xs uppercase tracking-wide text-slate-500 mb-3">Nivel</div>
          <div className="flex items-end gap-4">
            <div className="relative w-16 h-56 border-[6px] rounded-b-xl rounded-t-full bg-white overflow-hidden">
              <div
                className="absolute bottom-0 left-0 right-0"
                style={{ height: `${toPct(tank.levelPct)}%` }}
              >
                <div className="absolute inset-0 bg-gradient-to-t from-cyan-700 via-cyan-500 to-cyan-300" />
                <div className="absolute top-0 left-0 right-0 h-2 bg-white/50" />
              </div>
            </div>
            <div>
              <div className="text-4xl font-semibold tabular-nums">
                {typeof tank.levelPct === "number" ? Math.round(tank.levelPct) : "—"}%
              </div>
              <div className="text-xs text-slate-500">
                {tank.volumeL != null ? fmtLiters(tank.volumeL) : "—"} /{" "}
                {tank.capacityL != null ? fmtLiters(tank.capacityL) : "—"}
              </div>
            </div>
          </div>
        </div>

        {/* Umbrales */}
        <div className="p-4 bg-slate-50 rounded-xl">
          <div className="text-xs uppercase tracking-wide text-slate-500 mb-3">Umbrales</div>
          <div className="space-y-1 divide-y divide-slate-200/60">
            <KeyVal k="Muy bajo" v={`${th.lowCritical}%`} />
            <KeyVal k="Bajo" v={`${th.lowWarning}%`} />
            <KeyVal k="Alto" v={`${th.highWarning}%`} />
            <KeyVal k="Muy alto" v={`${th.highCritical}%`} />
          </div>
        </div>

        {/* Ficha técnica */}
        <div className="p-4 bg-slate-50 rounded-xl md:col-span-2">
          <div className="text-xs uppercase tracking-wide text-slate-500 mb-3">Ficha técnica</div>
          <div className="space-y-1 divide-y divide-slate-200/60 text-sm">
            <KeyVal k="Material" v={materialLabel} />
            <KeyVal k="Fluido" v={fluidLabel} />
            <KeyVal k="Año de instalación" v={installYearLabel} />
            <KeyVal k="Ubicación" v={locationLabel} />
          </div>
        </div>
      </div>
    </div>
  );
}
