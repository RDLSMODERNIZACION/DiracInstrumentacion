// src/hooks/useLiveOps.ts
import { useEffect, useMemo, useRef, useState } from "react";
import { getPumps, getTanks } from "@/api/kpi";
import { fetchBuckets, fetchPumpsActive, fetchTankLevelAvg } from "@/api/graphs";

const WINDOW_MS  = 24 * 60 * 60 * 1000;  // 24h
const SAMPLE_MS  = 5_000;                // sampleo en vivo cada 5s
const FIRST_PAD  = SAMPLE_MS;            // separación artificial del primer punto (evita barra 0px)

type Series = {
  timestamps: number[];
  pumps_on: number[];              // cantidad de bombas ENCENDIDAS (no “online”)
  level_percent: (number | null)[];
  pumps_total: number;
};

type Opts = { locationId?: number | "all"; entityId?: number };

/** Normaliza “encendida” de forma robusta (no es lo mismo que online). */
function pumpIsOn(p: any): boolean {
  if (typeof p?.is_on === "boolean") return p.is_on;
  if (typeof p?.isOn === "boolean") return p.isOn;

  const s = String(p?.state ?? "").toLowerCase();
  if (["on", "encendida", "running", "activo", "active", "start"].includes(s)) return true;
  if (["off", "apagada", "stopped", "idle"].includes(s)) return false;

  // último recurso: si solo tenemos online y no hay state, tomamos online
  if (typeof p?.online === "boolean" && !p?.state) return p.online;

  return false;
}

/** Suavizado anti-parpadeo ante micro-cortes de HB. */
function makePumpSmoother() {
  const SMOOTH_MS = Math.max(SAMPLE_MS * 2, 8_000); // al menos 8s
  const lastOnAt = new Map<string | number, number>();
  return {
    update(now: number, pumps: any[]) {
      for (const p of pumps) {
        const id = p?.pump_id ?? p?.id ?? p?.name;
        if (id != null && pumpIsOn(p)) lastOnAt.set(id, now);
      }
    },
    isOn(now: number, p: any) {
      const id = p?.pump_id ?? p?.id ?? p?.name;
      if (id == null) return pumpIsOn(p);
      const last = lastOnAt.get(id) ?? 0;
      const smooth = now - last <= SMOOTH_MS;
      return pumpIsOn(p) || smooth;
    },
  };
}

export function useLiveOps(opts: Opts = {}) {
  const [data, setData] = useState<Series>({
    timestamps: [],
    pumps_on: [],
    level_percent: [],
    pumps_total: 0,
  });

  const smootherRef = useRef(makePumpSmoother());

  // Limpiar al cambiar ubicación/entidad (seguimos en 24h fijo)
  useEffect(() => {
    setData({ timestamps: [], pumps_on: [], level_percent: [], pumps_total: 0 });
  }, [opts.locationId, opts.entityId]);

  // Seed histórico horario (para llenar la ventana inicial de 24h)
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const now = new Date();
        const from = new Date(now.getTime() - WINDOW_MS);
        const locId = typeof opts.locationId === "number" ? opts.locationId : undefined;

        const [buckets, pumpsHourly, tankHourly] = await Promise.all([
          fetchBuckets(from.toISOString(), now.toISOString()),
          fetchPumpsActive(from.toISOString(), now.toISOString(), locId),
          fetchTankLevelAvg(from.toISOString(), now.toISOString(), locId, opts.entityId),
        ]);

        const N = Math.max(buckets.length, pumpsHourly.length, tankHourly.length);
        const ts: number[] = new Array(N);
        for (let i = 0; i < N; i++) ts[i] = from.getTime() + i * 3600_000; // 1h steps

        const pumps_on = new Array(N).fill(0);
        for (let i = 0; i < Math.min(N, pumpsHourly.length); i++) {
          const v = (pumpsHourly[i] as any)?.pumps_count;
          pumps_on[i] = typeof v === "number" ? v : 0;
        }

        const level_percent = new Array(N).fill(null);
        for (let i = 0; i < Math.min(N, tankHourly.length); i++) {
          const v = (tankHourly[i] as any)?.avg_level_pct;
          level_percent[i] = v == null || Number.isNaN(Number(v)) ? null : Number(v);
        }

        if (!alive) return;
        setData({ timestamps: ts, pumps_on, level_percent, pumps_total: 0 });
      } catch {
        // si falla seed, seguimos con live
      }
    })();
    return () => { alive = false; };
  }, [opts.locationId, opts.entityId]);

  // Live sampling cada 5s (24h fijo)
  useEffect(() => {
    let alive = true;
    const smoother = smootherRef.current;

    async function sample() {
      try {
        const now = Date.now();
        const [pumps, tanks] = await Promise.all([getPumps(), getTanks()]);
        const locId = opts.locationId;

        const pumpsFiltered = Array.isArray(pumps)
          ? pumps.filter((p) =>
              locId == null || locId === "all" ? true : (p.location_id ?? p.location_name) === locId
            )
          : [];

        const tanksFiltered = Array.isArray(tanks)
          ? tanks.filter((t) =>
              locId == null || locId === "all" ? true : (t.location_id ?? t.location_name) === locId
            )
          : [];

        // suavizado anti-parpadeo
        smoother.update(now, pumpsFiltered);
        const onCount = pumpsFiltered.reduce((acc, p) => acc + (smoother.isOn(now, p) ? 1 : 0), 0);

        const avgLevel =
          tanksFiltered.length > 0
            ? tanksFiltered.reduce((a, t) => a + (t.level_pct ?? 0), 0) / tanksFiltered.length
            : null;

        if (!alive) return;
        setData((prev) => {
          // ⚠️ Primer sample: duplicamos el punto (ahora-FIRST_PAD, ahora) para asegurar ancho visible
          let timestamps = prev.timestamps;
          let pumps_on = prev.pumps_on;
          let level_percent = prev.level_percent;

          if (timestamps.length === 0) {
            timestamps = [now - FIRST_PAD, now];
            pumps_on = [onCount, onCount];
            level_percent = [avgLevel, avgLevel];
          } else {
            timestamps = timestamps.concat(now);
            pumps_on = pumps_on.concat(onCount);
            level_percent = level_percent.concat(avgLevel);
          }

          // recortar ventana a 24h
          const cutoff = now - WINDOW_MS;
          let s = 0;
          const L = timestamps.length;
          while (s < L && timestamps[s] < cutoff) s++;

          return {
            timestamps: s ? timestamps.slice(s) : timestamps,
            pumps_on: s ? pumps_on.slice(s) : pumps_on,
            level_percent: s ? level_percent.slice(s) : level_percent,
            pumps_total: Math.max(prev.pumps_total, pumpsFiltered.length),
          };
        });
      } catch {
        // ignoramos errores de muestreo
      }
    }

    sample();
    const t = window.setInterval(sample, SAMPLE_MS);
    return () => { alive = false; clearInterval(t); };
  }, [opts.locationId, opts.entityId]);

  // (Opcional) actualizaciones instantáneas vía postMessage
  useEffect(() => {
    function onMsg(ev: MessageEvent) {
      const d: any = ev?.data;
      if (!d || !d.type) return;
      const now = Date.now();
      if (d.type === "dirac:pump-toggled") {
        setData((prev) => {
          const lastOn = prev.pumps_on.at(-1) ?? 0;
          const nextOn = d.is_on ? lastOn + 1 : Math.max(0, lastOn - 1);
          const lastLvl = prev.level_percent.at(-1) ?? null;
          const timestamps = prev.timestamps.length === 0 ? [now - FIRST_PAD, now] : prev.timestamps.concat(now);
          const pumps_on = prev.timestamps.length === 0 ? [nextOn, nextOn] : prev.pumps_on.concat(nextOn);
          const level_percent = prev.timestamps.length === 0 ? [lastLvl, lastLvl] : prev.level_percent.concat(lastLvl);
          return { ...prev, timestamps, pumps_on, level_percent };
        });
      }
      if (d.type === "dirac:tank-level") {
        const lvl = typeof d.level === "number" ? d.level : null;
        setData((prev) => {
          const lastOn = prev.pumps_on.at(-1) ?? 0;
          const timestamps = prev.timestamps.length === 0 ? [now - FIRST_PAD, now] : prev.timestamps.concat(now);
          const pumps_on = prev.timestamps.length === 0 ? [lastOn, lastOn] : prev.pumps_on.concat(lastOn);
          const level_percent = prev.timestamps.length === 0 ? [lvl, lvl] : prev.level_percent.concat(lvl);
          return { ...prev, timestamps, pumps_on, level_percent };
        });
      }
    }
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  // Salidas sincronizadas (mismo eje X)
  const tankTs = useMemo(
    () => ({ timestamps: data.timestamps, level_percent: data.level_percent }),
    [data.timestamps, data.level_percent]
  );
  const pumpTs = useMemo(
    () => ({ timestamps: data.timestamps, is_on: data.pumps_on }),
    [data.timestamps, data.pumps_on]
  );

  return { tankTs, pumpTs, pumpsTotal: data.pumps_total };
}
