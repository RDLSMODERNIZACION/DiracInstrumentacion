import { useEffect, useMemo, useState } from "react";
import { fetchPumpsLive, fetchTanksLive } from "@/api/graphs";
import { TZ, H, startOfMin, floorToMinuteISO, buildHourTicks, fmtDayTime } from "../helpers/time";

type TsTank = { timestamps: number[]; level_percent: (number | null)[] } | null;
type TsPump = { timestamps: number[]; is_on: (number | null)[] } | null;

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
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
  const MAX_OFFSET_MIN = 7 * 24 * 60;
  const MIN_OFFSET_MIN = 24 * 60;

  const [playEnabled, setPlayEnabled] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [playFinMin, setPlayFinMin] = useState(MAX_OFFSET_MIN);
  const [dragging, setDragging] = useState(false);
  const [finDebounced, setFinDebounced] = useState(MAX_OFFSET_MIN);

  const [playTankTs, setPlayTankTs] = useState<TsTank>(null);
  const [playPumpTs, setPlayPumpTs] = useState<TsPump>(null);
  const [loadingPlay, setLoadingPlay] = useState(false);

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
    const to = baseStartMs + clamp(playFinMin, MIN_OFFSET_MIN, MAX_OFFSET_MIN) * 60_000;
    const from = to - 24 * H;
    return [from, to];
  }, [baseStartMs, playFinMin]);

  // Dominio efectivo usado por los charts
  const domain = (playEnabled ? sliderDomain : xDomainLive) as [number, number];

  // Ticks y labels
  const ticks = useMemo(() => buildHourTicks(domain), [domain[0], domain[1]]);
  const startLabel = useMemo(() => fmtDayTime(domain[0], TZ), [domain]);
  const endLabel = useMemo(() => fmtDayTime(domain[1], TZ), [domain]);

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
    const id = window.setTimeout(() => setFinDebounced(clamp(playFinMin, MIN_OFFSET_MIN, MAX_OFFSET_MIN)), 600);
    return () => window.clearTimeout(id);
  }, [playEnabled, dragging, playFinMin, locId]);

  // Fetch de la ventana 24h (playback)
  useEffect(() => {
    if (!playEnabled || !locId) {
      setPlayTankTs(null);
      setPlayPumpTs(null);
      return;
    }
    let cancelled = false;
    const toMs = startOfMin(baseStartMs + clamp(finDebounced, MIN_OFFSET_MIN, MAX_OFFSET_MIN) * 60_000);
    const fromMs = toMs - 24 * H;
    const fromISO = floorToMinuteISO(new Date(fromMs));
    const toISO = floorToMinuteISO(new Date(toMs));
    setLoadingPlay(true);
    (async () => {
      try {
        const [pumps, tanks] = await Promise.all([
          fetchPumpsLive({
            from: fromISO,
            to: toISO,
            locationId: locId,
            pumpIds: selectedPumpIds === "all" ? undefined : selectedPumpIds,
            bucket: "1min",
            aggMode: "avg",
            connectedOnly: true,
          }),
          fetchTanksLive({
            from: fromISO,
            to: toISO,
            locationId: locId,
            tankIds: selectedTankIds === "all" ? undefined : selectedTankIds,
            agg: "avg",
            carry: true,
            bucket: "1min",
            connectedOnly: true,
          }),
        ]);
        if (cancelled) return;
        setPlayPumpTs({ timestamps: pumps.timestamps, is_on: pumps.is_on });
        setPlayTankTs({ timestamps: tanks.timestamps, level_percent: tanks.level_percent });
      } catch (e) {
        if (!cancelled) {
          setPlayPumpTs(null);
          setPlayTankTs(null);
        }
        console.error("[playback] fetch error:", e);
      } finally {
        if (!cancelled) setLoadingPlay(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [playEnabled, finDebounced, locId, selectedPumpIds, selectedTankIds, baseStartMs]);

  // Auto-play: 10 min/seg hasta llegar a "ahora"
  useEffect(() => {
    if (!playEnabled || !playing) return;
    const id = window.setInterval(() => {
      setPlayFinMin((prev) => {
        const next = clamp(prev + 10, MIN_OFFSET_MIN, MAX_OFFSET_MIN);
        if (next >= MAX_OFFSET_MIN) {
          // llegamos al final → detener autoplay
          setPlaying(false);
        }
        return next;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [playEnabled, playing]);

  // Reset seguro al deshabilitar playback
  useEffect(() => {
    if (!playEnabled) {
      setPlaying(false);
      setPlayFinMin(MAX_OFFSET_MIN);
      setFinDebounced(MAX_OFFSET_MIN);
      setPlayPumpTs(null);
      setPlayTankTs(null);
    }
  }, [playEnabled]);

  // Series finales (usa live cuando playback está apagado)
  const tankTs = playEnabled && playTankTs ? playTankTs : (liveTankTs ?? { timestamps: [], level_percent: [] });
  const pumpTs = playEnabled && playPumpTs ? playPumpTs : (livePumpTs ?? { timestamps: [], is_on: [] });

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
