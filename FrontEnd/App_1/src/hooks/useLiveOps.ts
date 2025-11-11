// src/hooks/useLiveOps.ts
//
// Hook LIVE para Operación (24h): devuelve series sincronizadas para
//  - Bombas: cantidad de bombas ON por minuto (perfil continuo)
//  - Tanques: placeholder (hasta que tengamos endpoint live de niveles)
//
// Principales mejoras:
// 1) Usa el endpoint nuevo /kpi/bombas/live (carry-forward en backend).
// 2) Ventana fija de 24h (configurable) alineada al minuto.
// 3) Polling simple con abort/cleanup y tolerante a errores.
// 4) API clara: locationId | companyId | pumpIds | connectedOnly.
//

import { useEffect, useMemo, useRef, useState } from "react";
import { fetchPumpsLive, PumpsLiveResp } from "@/api/graphs";

// ===== Tipos de salida que consumen los charts =====
export type TankTs = {
  timestamps?: Array<number | string>;
  level_percent?: Array<number | string | null>;
};
export type PumpTs = {
  timestamps?: number[];
  is_on?: number[];
};

type Args = {
  /** Filtro por ubicación (undefined/"all" = todas) */
  locationId?: number | "all";
  /** Scope por empresa (opcional) */
  companyId?: number;
  /** Para filtrar bombas explícitas (omite company/location) */
  pumpIds?: number[];
  /** Horas a mostrar (default 24) */
  periodHours?: number;
  /** Polling ms (default 15000) */
  pollMs?: number;
  /** Sólo contar bombas con heartbeats en ventana (default true) */
  connectedOnly?: boolean;
};

type LiveOps = {
  tankTs: TankTs | null;
  pumpTs: PumpTs | null;
  pumpsTotal?: number;       // total de bombas del scope (empresa/loc o pumpIds)
  pumpsConnected?: number;   // cuántas reportaron en [from,to)
  window?: { start: number; end: number }; // epoch ms, alineado a minuto
};

// ===== utilitarios de tiempo =====
function floorToMinute(ms: number) {
  const d = new Date(ms);
  d.setSeconds(0, 0);
  return d.getTime();
}
function endNowAligned() {
  return floorToMinute(Date.now());
}
function startFrom(endMs: number, hours: number) {
  return endMs - hours * 3600_000;
}

export function useLiveOps({
  locationId,
  companyId,
  pumpIds,
  periodHours = 24,
  pollMs = 15_000,
  connectedOnly = true,
}: Args = {}): LiveOps {
  const [pump, setPump] = useState<PumpsLiveResp | null>(null);

  // Guardamos última ventana pedida para exponerla al caller (widget)
  const [win, setWin] = useState<{ start: number; end: number } | undefined>(undefined);

  // Abort simple entre renders/polls
  const abortSeq = useRef(0);

  useEffect(() => {
    let mounted = true;
    const seq = ++abortSeq.current;

    async function load() {
      try {
        // Ventana [from, to) alineada al minuto
        const end = endNowAligned();
        const start = startFrom(end, periodHours);
        setWin({ start, end });

        const locId = typeof locationId === "number" ? locationId : undefined;

        const resp = await fetchPumpsLive({
          from: new Date(start).toISOString(),
          to: new Date(end).toISOString(),
          locationId: locId,
          companyId,
          pumpIds,
          connectedOnly,
        });

        if (!mounted || seq !== abortSeq.current) return;
        setPump(resp);
      } catch (err) {
        // Toleramos errores transitorios sin romper la UI
        console.error("[useLiveOps] live fetch error:", err);
      }
    }

    // Primera carga inmediata y polling
    load();
    const t = window.setInterval(load, pollMs);
    return () => {
      mounted = false;
      window.clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationId, companyId, pumpIds?.join(","), periodHours, pollMs, connectedOnly]);

  // ===== Adaptadores a la forma que consumen los charts =====

  // Bombas: serie continua por minuto (ya alineada desde backend)
  const pumpTs = useMemo<PumpTs | null>(() => {
    if (!pump) return null;
    return { timestamps: pump.timestamps, is_on: pump.is_on };
  }, [pump]);

  // Tanques (placeholder): dejamos timestamps vacíos hasta tener endpoint live de niveles.
  // Si querés que grafique “línea base”, podés replicar timestamps de bombas con nulls:
  const tankTs = useMemo<TankTs | null>(() => {
    if (!pump) return null;
    return { timestamps: pump.timestamps, level_percent: pump.timestamps.map(() => null) };
  }, [pump]);

  return {
    tankTs,
    pumpTs,
    pumpsTotal: pump?.pumps_total,
    pumpsConnected: pump?.pumps_connected,
    window: win,
  };
}
