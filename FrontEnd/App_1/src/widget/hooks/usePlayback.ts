import { useEffect, useMemo, useRef, useState } from "react";
import { fetchPumpsLive, fetchTanksLive } from "@/api/graphs";
import {
  TZ,
  H,
  startOfMin,
  floorToMinuteISO,
  buildHourTicks,
  fmtDayTime,
} from "../helpers/time";

type TsTank = { timestamps: number[]; level_percent: (number | null)[] } | null;
type TsPump = { timestamps: number[]; is_on: (number | null)[] } | null;

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function stableKey(ids: number[] | "all") {
  if (ids === "all") return "all";
  const copy = [...ids].filter(Number.isFinite).sort((a, b) => a - b);
  return copy.join(",");
}

export function usePlayback({
  tab,
  locId,
  liveWindow,
  liveTankTs,
  livePumpTs,
  selectedPumpIds,
  selectedTankIds,
}: {
  tab: string;
  locId?: number;
  liveWindow?: { start: number; end: number } | null;
  liveTankTs?: TsTank | any;
  livePumpTs?: TsPump | any;
  selectedPumpIds: number[] | "all";
  selectedTankIds: number[] | "all";
}) {
  const MAX_OFFSET_MIN = 7 * 24 * 60; // 7 días hacia atrás
  const MIN_OFFSET_MIN = 24 * 60; // ventana mínima: 24 h

  const [playEnabled, setPlayEnabled] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [playFinMin, setPlayFinMin] = useState(MAX_OFFSET_MIN);
  const [dragging, setDragging] = useState(false);
  const [finDebounced, setFinDebounced] = useState(MAX_OFFSET_MIN);

  const [playTankTs, setPlayTankTs] = useState<TsTank>(null);
  const [playPumpTs, setPlayPumpTs] = useState<TsPump>(null);
  const [loadingPlay, setLoadingPlay] = useState(false);

  // NUEVO: velocidad de playback (0.5x, 1x, 2x, 4x)
  const [playSpeed, setPlaySpeed] = useState<0.5 | 1 | 2 | 4>(1);

  // Abort real para series
  const abortRef = useRef<AbortController | null>(null);

  // Base (inicio de la escala de 7 días), alineado a minuto. Se calcula una sola vez.
  const baseStartMs = useMemo(() => startOfMin(Date.now() - 7 * 24 * H), []);

  // Dominio LIVE (fallback si no hay ventana en vivo todavía)
  const xDomainLive = useMemo<[number, number]>(() => {
    const win = liveWindow;
    if (win?.start && win?.end) return [win.start, win.end];
    const end = startOfMin(Date.now());
    const start = end - 24 * H;
    return [start, end];
  }, [liveWindow]);

  // Dominio del slider (cuando hay playback)
  const sliderDomain: [number, number] = useMemo(() => {
    const finClamped = clamp(playFinMin, MIN_OFFSET_MIN, MAX_OFFSET_MIN);
    const to = baseStartMs + finClamped * 60_000;
    const from = to - 24 * H;
    return [from, to];
  }, [baseStartMs, playFinMin, MIN_OFFSET_MIN, MAX_OFFSET_MIN]);

  // Dominio efectivo usado por los charts
  const domain = (playEnabled ? sliderDomain : xDomainLive) as [number, number];

  // Ticks y labels
  const ticks = useMemo(() => buildHourTicks(domain), [domain[0], domain[1]]);
  const startLabel = useMemo(() => fmtDayTime(domain[0], TZ), [domain[0]]);
  const endLabel = useMemo(() => fmtDayTime(domain[1], TZ), [domain[1]]);

  // Si salís de la pestaña Operación, apagamos playback/autoplay
  useEffect(() => {
    if (tab !== "operacion") {
      setPlayEnabled(false);
      setPlaying(false);
    }
  }, [tab]);

  // Debounce cuando NO estás arrastrando (programa fetch a los 600 ms)
  useEffect(() => {
    if (!playEnabled || !locId) return;
    if (dragging) return;
    const id = window.setTimeout(() => {
      setFinDebounced(clamp(playFinMin, MIN_OFFSET_MIN, MAX_OFFSET_MIN));
    }, 600);
    return () => window.clearTimeout(id);
  }, [playEnabled, dragging, playFinMin, locId, MIN_OFFSET_MIN, MAX_OFFSET_MIN]);

  // Keys estables para deps (evita re-fetch por referencia distinta)
  const pumpIdsKey = useMemo(() => stableKey(selectedPumpIds), [selectedPumpIds]);
  const tankIdsKey = useMemo(() => stableKey(selectedTankIds), [selectedTankIds]);

  // Fetch de la ventana 24h (playback)
  useEffect(() => {
    if (!playEnabled || !locId) {
      abortRef.current?.abort();
      abortRef.current = null;
      setPlayTankTs(null);
      setPlayPumpTs(null);
      setLoadingPlay(false);
      return;
    }

    // si justo está arrastrando, no tiene sentido disparar (el debounce lo hará)
    if (dragging) return;

    const finClamped = clamp(finDebounced, MIN_OFFSET_MIN, MAX_OFFSET_MIN);
    const toMs = startOfMin(baseStartMs + finClamped * 60_000);
    const fromMs = toMs - 24 * H;

    const fromISO = floorToMinuteISO(new Date(fromMs));
    const toISO = floorToMinuteISO(new Date(toMs));

    // abort anterior
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    setLoadingPlay(true);

    (async () => {
      try {
        const [pumps, tanks] = await Promise.all([
          fetchPumpsLive({
            from: fromISO,
            to: toISO,
            locationId: locId,
            pumpIds: selectedPumpIds === "all" ? undefined : selectedPumpIds,
            // ✅ KPI fijo a 5min
            bucket: "5min",
            aggMode: "avg",
            connectedOnly: true,
            // @ts-ignore (si luego soportás signal en graphs.ts, ya queda listo)
            signal: ac.signal,
          } as any),
          fetchTanksLive({
            from: fromISO,
            to: toISO,
            locationId: locId,
            tankIds: selectedTankIds === "all" ? undefined : selectedTankIds,
            agg: "avg",
            carry: true,
            // ✅ KPI fijo a 5min
            bucket: "5min",
            connectedOnly: true,
            // @ts-ignore
            signal: ac.signal,
          } as any),
        ]);

        if (ac.signal.aborted) return;

        setPlayPumpTs({ timestamps: pumps.timestamps, is_on: pumps.is_on });
        setPlayTankTs({ timestamps: tanks.timestamps, level_percent: tanks.level_percent });
      } catch (e: any) {
        if (e?.name === "AbortError") return;
        setPlayPumpTs(null);
        setPlayTankTs(null);
        console.error("[playback] fetch error:", e);
      } finally {
        if (!ac.signal.aborted) setLoadingPlay(false);
      }
    })();

    return () => {
      ac.abort();
    };
  }, [
    playEnabled,
    locId,
    dragging,
    finDebounced,
    baseStartMs,
    MIN_OFFSET_MIN,
    MAX_OFFSET_MIN,
    pumpIdsKey,
    tankIdsKey,
  ]);

  // Auto-play fluido: avanza según velocidad (0.5x, 1x, 2x, 4x)
  useEffect(() => {
    if (!playEnabled || !playing) return;

    const BASE_STEP_MIN = 2; // minutos por tick a 1x → suave
    const TICK_MS = 250; // 4 veces por segundo

    const id = window.setInterval(() => {
      setPlayFinMin((prev) => {
        const step = BASE_STEP_MIN * playSpeed;
        const next = clamp(prev + step, MIN_OFFSET_MIN, MAX_OFFSET_MIN);

        if (next >= MAX_OFFSET_MIN) {
          setPlaying(false);
        }
        return next;
      });
    }, TICK_MS);

    return () => window.clearInterval(id);
  }, [playEnabled, playing, playSpeed, MIN_OFFSET_MIN, MAX_OFFSET_MIN]);

  // Reset seguro al deshabilitar playback
  useEffect(() => {
    if (!playEnabled) {
      abortRef.current?.abort();
      abortRef.current = null;

      setPlaying(false);
      setPlayFinMin(MAX_OFFSET_MIN);
      setFinDebounced(MAX_OFFSET_MIN);
      setPlayPumpTs(null);
      setPlayTankTs(null);
      setLoadingPlay(false);
    }
  }, [playEnabled, MAX_OFFSET_MIN]);

  // Series finales (usa live cuando playback está apagado)
  const tankTs =
    playEnabled && playTankTs
      ? playTankTs
      : liveTankTs ?? { timestamps: [], level_percent: [] };

  const pumpTs =
    playEnabled && playPumpTs
      ? playPumpTs
      : livePumpTs ?? { timestamps: [], is_on: [] };

  return {
    // state
    playEnabled,
    setPlayEnabled,
    playing,
    setPlaying,
    playFinMin,
    setPlayFinMin,
    MIN_OFFSET_MIN,
    MAX_OFFSET_MIN,
    dragging,
    setDragging,
    // speed
    playSpeed,
    setPlaySpeed,
    // view
    domain,
    ticks,
    startLabel,
    endLabel,
    // series
    tankTs,
    pumpTs,
    // flags
    loadingPlay,
  };
}
