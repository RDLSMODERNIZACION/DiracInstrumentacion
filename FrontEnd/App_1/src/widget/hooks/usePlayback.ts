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

type TsTank =
  | {
      timestamps: number[];
      level_percent: Array<number | null>;
      level_min?: Array<number | null>;
      level_max?: Array<number | null>;
    }
  | null;

type TsPump =
  | {
      timestamps: number[];
      is_on: Array<number | null>;
      pumps_off?: Array<number | null>;
      pumps_online?: Array<number | null>;
      pumps_offline?: Array<number | null>;
    }
  | null;

function stableKey(ids: number[] | "all") {
  if (ids === "all") return "all";

  return [...ids]
    .filter(Number.isFinite)
    .sort((a, b) => a - b)
    .join(",");
}

function toDateInputAR(ms = Date.now()) {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(ms);

    const y = parts.find((p) => p.type === "year")?.value;
    const m = parts.find((p) => p.type === "month")?.value;
    const d = parts.find((p) => p.type === "day")?.value;

    if (y && m && d) return `${y}-${m}-${d}`;
  } catch {
    // fallback
  }

  return new Date(ms).toISOString().slice(0, 10);
}

function dayBoundsArgentina(dateStr: string): [number, number] {
  // Argentina usa UTC-03. Esto fuerza el día local:
  // 00:00 a 24:00 horario Argentina.
  const start = Date.parse(`${dateStr}T00:00:00-03:00`);
  const end = start + 24 * H;

  return [startOfMin(start), startOfMin(end)];
}

function addDaysToDateInput(dateStr: string, days: number) {
  const [start] = dayBoundsArgentina(dateStr);
  return toDateInputAR(start + days * 24 * H);
}

function clampDateInput(dateStr: string, minDate: string, maxDate: string) {
  if (!dateStr) return maxDate;
  if (dateStr < minDate) return minDate;
  if (dateStr > maxDate) return maxDate;
  return dateStr;
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
  const todayAR = useMemo(() => toDateInputAR(Date.now()), []);

  // IMPORTANTE:
  // La base guarda solamente los últimos 7 días.
  // El selector de fecha queda limitado entre hoy y 7 días hacia atrás.
  const minDate = useMemo(() => addDaysToDateInput(todayAR, -7), [todayAR]);
  const maxDate = todayAR;

  const [playEnabled, setPlayEnabled] = useState(false);
  const [playDateRaw, setPlayDateRaw] = useState(todayAR);
  const [dateDebounced, setDateDebounced] = useState(todayAR);

  const [playTankTs, setPlayTankTs] = useState<TsTank>(null);
  const [playPumpTs, setPlayPumpTs] = useState<TsPump>(null);
  const [loadingPlay, setLoadingPlay] = useState(false);

  const abortRef = useRef<AbortController | null>(null);

  const playDate = useMemo(
    () => clampDateInput(playDateRaw, minDate, maxDate),
    [playDateRaw, minDate, maxDate]
  );

  const setPlayDate = (v: string) => {
    setPlayDateRaw(clampDateInput(v, minDate, maxDate));
  };

  const prevDay = () => {
    setPlayDate(addDaysToDateInput(playDate, -1));
  };

  const nextDay = () => {
    setPlayDate(addDaysToDateInput(playDate, 1));
  };

  const goToday = () => {
    setPlayDate(todayAR);
  };

  const xDomainLive = useMemo<[number, number]>(() => {
    const win = liveWindow;

    if (win?.start && win?.end) {
      return [win.start, win.end];
    }

    const end = startOfMin(Date.now());
    const start = end - 24 * H;

    return [start, end];
  }, [liveWindow]);

  const dayDomain = useMemo<[number, number]>(() => {
    return dayBoundsArgentina(playDate);
  }, [playDate]);

  const domain = (playEnabled ? dayDomain : xDomainLive) as [number, number];

  const ticks = useMemo(() => buildHourTicks(domain), [domain[0], domain[1]]);

  const startLabel = useMemo(() => fmtDayTime(domain[0], TZ), [domain[0]]);
  const endLabel = useMemo(() => fmtDayTime(domain[1], TZ), [domain[1]]);

  const selectedDayLabel = useMemo(() => {
    const [start] = dayBoundsArgentina(playDate);

    return new Intl.DateTimeFormat("es-AR", {
      timeZone: TZ,
      weekday: "long",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(start);
  }, [playDate]);

  useEffect(() => {
    if (tab !== "operacion") {
      setPlayEnabled(false);
    }
  }, [tab]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      setDateDebounced(playDate);
    }, 350);

    return () => window.clearTimeout(id);
  }, [playDate]);

  const pumpIdsKey = useMemo(() => stableKey(selectedPumpIds), [selectedPumpIds]);
  const tankIdsKey = useMemo(() => stableKey(selectedTankIds), [selectedTankIds]);

  useEffect(() => {
    if (!playEnabled || !locId) {
      abortRef.current?.abort();
      abortRef.current = null;

      setPlayTankTs(null);
      setPlayPumpTs(null);
      setLoadingPlay(false);

      return;
    }

    const safeDate = clampDateInput(dateDebounced, minDate, maxDate);
    const [fromMs, toMs] = dayBoundsArgentina(safeDate);

    const fromISO = floorToMinuteISO(new Date(fromMs));
    const toISO = floorToMinuteISO(new Date(toMs));

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
            bucket: "5min",
            aggMode: "avg",
            connectedOnly: true,
            // @ts-ignore
            signal: ac.signal,
          } as any),

          fetchTanksLive({
            from: fromISO,
            to: toISO,
            locationId: locId,
            tankIds: selectedTankIds === "all" ? undefined : selectedTankIds,
            agg: "avg",
            carry: true,
            bucket: "5min",
            connectedOnly: true,
            // @ts-ignore
            signal: ac.signal,
          } as any),
        ]);

        if (ac.signal.aborted) return;

        setPlayPumpTs({
          timestamps: pumps?.timestamps ?? [],
          is_on: pumps?.is_on ?? [],
          pumps_off: pumps?.pumps_off ?? [],
          pumps_online: pumps?.pumps_online ?? [],
          pumps_offline: pumps?.pumps_offline ?? [],
        });

        setPlayTankTs({
          timestamps: tanks?.timestamps ?? [],
          level_percent: tanks?.level_percent ?? tanks?.level_avg ?? [],
          level_min: tanks?.level_min ?? [],
          level_max: tanks?.level_max ?? [],
        });
      } catch (e: any) {
        if (e?.name === "AbortError") return;

        setPlayPumpTs(null);
        setPlayTankTs(null);

        console.error("[playback day] fetch error:", e);
      } finally {
        if (!ac.signal.aborted) {
          setLoadingPlay(false);
        }
      }
    })();

    return () => {
      ac.abort();
    };
  }, [
    playEnabled,
    locId,
    dateDebounced,
    minDate,
    maxDate,
    pumpIdsKey,
    tankIdsKey,
    selectedPumpIds,
    selectedTankIds,
  ]);

  useEffect(() => {
    if (!playEnabled) {
      abortRef.current?.abort();
      abortRef.current = null;

      setPlayPumpTs(null);
      setPlayTankTs(null);
      setLoadingPlay(false);
    }
  }, [playEnabled]);

  const tankTs =
    playEnabled && playTankTs
      ? playTankTs
      : liveTankTs ?? { timestamps: [], level_percent: [] };

  const pumpTs =
    playEnabled && playPumpTs
      ? playPumpTs
      : livePumpTs ?? { timestamps: [], is_on: [] };

  return {
    playEnabled,
    setPlayEnabled,

    playDate,
    setPlayDate,
    minDate,
    maxDate,

    prevDay,
    nextDay,
    goToday,

    selectedDayLabel,

    domain,
    ticks,
    startLabel,
    endLabel,

    tankTs,
    pumpTs,

    loadingPlay,
  };
}