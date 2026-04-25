import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { scopedUrl, getApiHeaders } from "@/lib/config";

type ViewMode = "pumps" | "tanks";
type SortDir = "asc" | "desc";

type Props = {
  locationId?: number | string;
  selectedPumpIds?: number[] | string[] | "all";
  selectedTankIds?: number[] | string[] | "all";
  thresholdLow?: number;
};

type PumpDailyRow = {
  day_ts: string;
  pump_id: number;
  pump_name: string;
  location_id: number | null;
  location_name: string | null;
  starts_count: number;
  stops_count: number;
  running_seconds: number;
  stopped_seconds: number;
  availability_pct: number | null;
  total_state_events: number;
  first_event_at?: string | null;
  last_event_at?: string | null;
  estado_operativo: string;
  problem_score: number;
};

type TankDailyRow = {
  day_ts: string;
  tank_id: number;
  tank_name: string;
  location_id: number | null;
  location_name: string | null;
  total_events: number;
  active_events: number;
  normalized_events: number;
  low_events: number;
  low_critical_events: number;
  high_events: number;
  high_critical_events: number;
  min_detected_value: number | null;
  max_detected_value: number | null;
  avg_detected_value: number | null;
  total_duration_seconds: number;
  estado_operativo: string;
};

type PumpRankingRow = {
  pump_id: number;
  pump_name: string;
  location_id: number | null;
  location_name: string | null;
  starts_count: number;
  stops_count: number;
  running_seconds: number;
  stopped_seconds: number;
  availability_pct: number | null;
  total_state_events: number;
  first_event_at?: string | null;
  last_event_at?: string | null;
  problem_score: number;
  estado_operativo: string;
};

type TankRankingRow = {
  tank_id: number;
  tank_name: string;
  location_id: number | null;
  location_name: string | null;
  total_events: number;
  active_events: number;
  normalized_events: number;
  low_events: number;
  low_critical_events: number;
  high_events: number;
  high_critical_events: number;
  min_detected_value: number | null;
  max_detected_value: number | null;
  avg_detected_value: number | null;
  total_duration_seconds: number;
  problem_score: number;
  estado_operativo: string;
};

type PumpDayEvent = {
  id: number;
  pump_id: number;
  pump_name: string;
  location_id: number | null;
  location_name: string | null;
  state: string;
  state_label: string;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  duration_label: string | null;
  source?: string | null;
};

type TankDayEvent = {
  id: number;
  tank_id: number;
  tank_name: string;
  location_id: number | null;
  location_name: string | null;
  event_type: string;
  event_label: string;
  configured_limit: number | null;
  detected_value: number | null;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  duration_label: string | null;
  status: string;
  status_label: string;
};

type DayEvent = PumpDayEvent | TankDayEvent;

type ChartRow = {
  day_ts: string;
  day_label?: string;
  total_starts?: number;
  total_stops?: number;
  avg_availability_pct?: number | null;
  total_problem_score?: number;
  total_events?: number;
  active_events?: number;
  low_events?: number;
  low_critical_events?: number;
  high_events?: number;
  high_critical_events?: number;
  total_duration_seconds?: number;
};

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function prevMonth(value: string) {
  const [y, m] = value.split("-").map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function nextMonth(value: string) {
  const [y, m] = value.split("-").map(Number);
  const d = new Date(y, m, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function toNum(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function fmtInt(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "-";
  return Math.round(n).toLocaleString("es-AR");
}

function fmtNum(value: unknown, digits = 2) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "-";
  return n.toLocaleString("es-AR", { maximumFractionDigits: digits });
}

function fmtPct(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "-";
  return `${n.toLocaleString("es-AR", { maximumFractionDigits: 1 })}%`;
}

function fmtHours(seconds: unknown) {
  const s = Number(seconds);
  if (!Number.isFinite(s) || s <= 0) return "-";

  if (s < 60) return `${Math.round(s)} seg`;

  const minutes = s / 60;
  if (minutes < 60) {
    return `${minutes.toLocaleString("es-AR", { maximumFractionDigits: 1 })} min`;
  }

  const hours = s / 3600;
  return `${hours.toLocaleString("es-AR", { maximumFractionDigits: 1 })} h`;
}

function dayLabel(day: string) {
  if (!day) return "-";
  const parts = day.split("-");
  if (parts.length !== 3) return day;
  return `${parts[2]}/${parts[1]}`;
}

function safeLocationId(value: Props["locationId"]) {
  if (value === undefined || value === null || value === "" || value === "all") {
    return undefined;
  }

  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function buildUrl(
  path: string,
  params: Record<string, string | number | undefined | null>
) {
  const query = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (
      value !== undefined &&
      value !== null &&
      value !== "" &&
      value !== "all"
    ) {
      query.set(key, String(value));
    }
  });

  const base = scopedUrl(path);
  const qs = query.toString();

  if (!qs) return base;

  return `${base}${base.includes("?") ? "&" : "?"}${qs}`;
}

async function fetchJson<T>(
  path: string,
  params: Record<string, string | number | undefined | null> = {}
): Promise<T> {
  const res = await fetch(buildUrl(path, params), {
    method: "GET",
    headers: getApiHeaders(),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Error ${res.status}: ${text || res.statusText}`);
  }

  return res.json();
}

function normalizeIdSet(value: Props["selectedPumpIds"] | Props["selectedTankIds"]) {
  if (value === "all" || !Array.isArray(value) || value.length === 0) {
    return null;
  }

  const ids = value
    .map((v) => Number(v))
    .filter((v) => Number.isFinite(v));

  return ids.length > 0 ? new Set(ids) : null;
}

function statusStyle(status?: string) {
  const s = String(status || "").toLowerCase();

  if (
    s.includes("severo") ||
    s.includes("activo") ||
    s.includes("vacio") ||
    s.includes("vacío") ||
    s.includes("rebalse") ||
    s.includes("muy")
  ) {
    return "border-red-200 bg-red-50 text-red-700";
  }

  if (
    s.includes("baja") ||
    s.includes("prolongado") ||
    s.includes("inestable")
  ) {
    return "border-orange-200 bg-orange-50 text-orange-700";
  }

  if (s.includes("revisar") || s.includes("muchos")) {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }

  return "border-emerald-200 bg-emerald-50 text-emerald-700";
}

function eventStyle(value?: string) {
  const s = String(value || "").toLowerCase();

  if (
    s.includes("low_low") ||
    s.includes("high_high") ||
    s.includes("crítico") ||
    s.includes("critico")
  ) {
    return "border-red-200 bg-red-50 text-red-700";
  }

  if (s.includes("low") || s.includes("bajo")) {
    return "border-blue-200 bg-blue-50 text-blue-700";
  }

  if (s.includes("high") || s.includes("alto")) {
    return "border-orange-200 bg-orange-50 text-orange-700";
  }

  if (s.includes("run") || s.includes("encendida")) {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (s.includes("stop") || s.includes("apagada")) {
    return "border-slate-200 bg-slate-100 text-slate-700";
  }

  return "border-slate-200 bg-white text-slate-700";
}

function problemBarClass(score: number) {
  if (score >= 120) return "bg-red-500";
  if (score >= 60) return "bg-orange-500";
  if (score >= 25) return "bg-amber-400";
  return "bg-emerald-500";
}

function localTime(value?: string | null) {
  if (!value) return "-";

  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";

  return new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function localDateTime(value?: string | null) {
  if (!value) return "-";

  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";

  return new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function localHHMM(value?: string | null) {
  if (!value) return "";

  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";

  return new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .format(d)
    .replace(".", ":");
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3 text-xs shadow-xl">
      <div className="mb-2 font-semibold text-slate-900">{label}</div>
      <div className="space-y-1">
        {payload.map((p: any) => (
          <div key={p.dataKey} className="flex justify-between gap-4">
            <span className="text-slate-500">{p.name || p.dataKey}</span>
            <span className="font-semibold text-slate-900">
              {typeof p.value === "number"
                ? p.value.toLocaleString("es-AR", { maximumFractionDigits: 2 })
                : p.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  help,
  tone = "slate",
}: {
  label: string;
  value: string;
  help?: string;
  tone?: "slate" | "red" | "orange" | "emerald" | "blue";
}) {
  const tones = {
    slate: "border-slate-200 bg-white text-slate-900",
    red: "border-red-200 bg-red-50 text-red-800",
    orange: "border-orange-200 bg-orange-50 text-orange-800",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-800",
    blue: "border-blue-200 bg-blue-50 text-blue-800",
  };

  return (
    <div className={`rounded-3xl border p-5 shadow-sm ${tones[tone]}`}>
      <div className="text-xs font-medium uppercase tracking-wide opacity-70">
        {label}
      </div>
      <div className="mt-2 text-3xl font-black tracking-tight">{value}</div>
      {help ? <div className="mt-1 text-xs opacity-70">{help}</div> : null}
    </div>
  );
}

export default function ReliabilityPage({
  locationId = "all",
  selectedPumpIds = "all",
  selectedTankIds = "all",
}: Props) {
  const [view, setView] = useState<ViewMode>("pumps");
  const [month, setMonth] = useState(currentMonth());

  const [pumpDaily, setPumpDaily] = useState<PumpDailyRow[]>([]);
  const [tankDaily, setTankDaily] = useState<TankDailyRow[]>([]);
  const [pumpRanking, setPumpRanking] = useState<PumpRankingRow[]>([]);
  const [tankRanking, setTankRanking] = useState<TankRankingRow[]>([]);

  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [dayEvents, setDayEvents] = useState<DayEvent[]>([]);

  const [sortKey, setSortKey] = useState("problem_score");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const [loading, setLoading] = useState(false);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [error, setError] = useState("");
  const [eventError, setEventError] = useState("");

  const [eventSearch, setEventSearch] = useState("");
  const [eventTypeFilter, setEventTypeFilter] = useState("all");
  const [eventStatusFilter, setEventStatusFilter] = useState("all");
  const [eventHourFrom, setEventHourFrom] = useState("");
  const [eventHourTo, setEventHourTo] = useState("");
  const [minDurationMinutes, setMinDurationMinutes] = useState("");

  const locParam = safeLocationId(locationId);

  const selectedPumpSet = useMemo(
    () => normalizeIdSet(selectedPumpIds),
    [selectedPumpIds]
  );

  const selectedTankSet = useMemo(
    () => normalizeIdSet(selectedTankIds),
    [selectedTankIds]
  );

  useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);
      setError("");

      try {
        const [pd, pr, td, tr] = await Promise.all([
          fetchJson<{ ok: boolean; items: PumpDailyRow[] }>(
            "/kpi/operation-reliability/pump-daily",
            {
              month,
              location_id: locParam,
            }
          ),
          fetchJson<{ ok: boolean; items: PumpRankingRow[] }>(
            "/kpi/operation-reliability/pump-ranking",
            {
              month,
              location_id: locParam,
              limit: 100,
            }
          ),
          fetchJson<{ ok: boolean; items: TankDailyRow[] }>(
            "/kpi/operation-reliability/tank-daily",
            {
              month,
              location_id: locParam,
            }
          ),
          fetchJson<{ ok: boolean; items: TankRankingRow[] }>(
            "/kpi/operation-reliability/tank-ranking",
            {
              month,
              location_id: locParam,
              limit: 100,
            }
          ),
        ]);

        if (!alive) return;

        setPumpDaily(Array.isArray(pd.items) ? pd.items : []);
        setPumpRanking(Array.isArray(pr.items) ? pr.items : []);
        setTankDaily(Array.isArray(td.items) ? td.items : []);
        setTankRanking(Array.isArray(tr.items) ? tr.items : []);

        setSelectedDay(null);
        setDayEvents([]);
        setEventError("");
      } catch (e: any) {
        if (!alive) return;
        setError(e?.message || "No se pudieron cargar los datos.");
      } finally {
        if (alive) setLoading(false);
      }
    }

    load();

    return () => {
      alive = false;
    };
  }, [month, locParam]);

  async function loadDayEvents(day: string) {
    setLoadingEvents(true);
    setEventError("");
    setDayEvents([]);

    try {
      const endpoint =
        view === "pumps"
          ? "/kpi/operation-reliability/pump-day-events"
          : "/kpi/operation-reliability/tank-day-events";

      const data = await fetchJson<{ ok: boolean; items: DayEvent[] }>(
        endpoint,
        {
          day,
          location_id: locParam,
        }
      );

      setDayEvents(Array.isArray(data.items) ? data.items : []);
    } catch (e: any) {
      setEventError(e?.message || "No se pudo cargar el historial del día.");
    } finally {
      setLoadingEvents(false);
    }
  }

  function resetEventFilters() {
    setEventSearch("");
    setEventTypeFilter("all");
    setEventStatusFilter("all");
    setEventHourFrom("");
    setEventHourTo("");
    setMinDurationMinutes("");
  }

  function selectDay(day: string) {
    setSelectedDay(day);
    setDayEvents([]);
    resetEventFilters();
    loadDayEvents(day);
  }

  function clearSelectedDay() {
    setSelectedDay(null);
    setDayEvents([]);
    setEventError("");
    resetEventFilters();
  }

  const filteredPumpDaily = useMemo(() => {
    if (!selectedPumpSet) return pumpDaily;
    return pumpDaily.filter((r) => selectedPumpSet.has(Number(r.pump_id)));
  }, [pumpDaily, selectedPumpSet]);

  const filteredTankDaily = useMemo(() => {
    if (!selectedTankSet) return tankDaily;
    return tankDaily.filter((r) => selectedTankSet.has(Number(r.tank_id)));
  }, [tankDaily, selectedTankSet]);

  const filteredPumpRanking = useMemo(() => {
    if (!selectedPumpSet) return pumpRanking;
    return pumpRanking.filter((r) => selectedPumpSet.has(Number(r.pump_id)));
  }, [pumpRanking, selectedPumpSet]);

  const filteredTankRanking = useMemo(() => {
    if (!selectedTankSet) return tankRanking;
    return tankRanking.filter((r) => selectedTankSet.has(Number(r.tank_id)));
  }, [tankRanking, selectedTankSet]);

  const pumpChart = useMemo<ChartRow[]>((() => {
    const map = new Map<
      string,
      ChartRow & { availability_sum: number; availability_count: number }
    >();

    for (const r of filteredPumpDaily) {
      const key = r.day_ts;
      const curr =
        map.get(key) ||
        ({
          day_ts: key,
          total_starts: 0,
          total_stops: 0,
          total_problem_score: 0,
          avg_availability_pct: null,
          availability_sum: 0,
          availability_count: 0,
        } as ChartRow & {
          availability_sum: number;
          availability_count: number;
        });

      curr.total_starts = toNum(curr.total_starts) + toNum(r.starts_count);
      curr.total_stops = toNum(curr.total_stops) + toNum(r.stops_count);
      curr.total_problem_score =
        toNum(curr.total_problem_score) + toNum(r.problem_score);

      if (r.availability_pct !== null && r.availability_pct !== undefined) {
        curr.availability_sum += toNum(r.availability_pct);
        curr.availability_count += 1;
        curr.avg_availability_pct = Number(
          (curr.availability_sum / curr.availability_count).toFixed(2)
        );
      }

      map.set(key, curr);
    }

    return Array.from(map.values())
      .sort((a, b) => a.day_ts.localeCompare(b.day_ts))
      .map(({ availability_sum, availability_count, ...r }) => r);
  }) as () => ChartRow[], [filteredPumpDaily]);

  const tankChart = useMemo<ChartRow[]>(() => {
    const map = new Map<string, ChartRow>();

    for (const r of filteredTankDaily) {
      const key = r.day_ts;
      const curr =
        map.get(key) ||
        ({
          day_ts: key,
          total_events: 0,
          active_events: 0,
          low_events: 0,
          low_critical_events: 0,
          high_events: 0,
          high_critical_events: 0,
          total_duration_seconds: 0,
        } as ChartRow);

      curr.total_events = toNum(curr.total_events) + toNum(r.total_events);
      curr.active_events = toNum(curr.active_events) + toNum(r.active_events);
      curr.low_events = toNum(curr.low_events) + toNum(r.low_events);
      curr.low_critical_events =
        toNum(curr.low_critical_events) + toNum(r.low_critical_events);
      curr.high_events = toNum(curr.high_events) + toNum(r.high_events);
      curr.high_critical_events =
        toNum(curr.high_critical_events) + toNum(r.high_critical_events);
      curr.total_duration_seconds =
        toNum(curr.total_duration_seconds) + toNum(r.total_duration_seconds);

      map.set(key, curr);
    }

    return Array.from(map.values()).sort((a, b) =>
      a.day_ts.localeCompare(b.day_ts)
    );
  }, [filteredTankDaily]);

  const chartData = view === "pumps" ? pumpChart : tankChart;

  const selectedDayDailyRows = useMemo(() => {
    if (!selectedDay) return [];

    return view === "pumps"
      ? filteredPumpDaily.filter((r) => r.day_ts === selectedDay)
      : filteredTankDaily.filter((r) => r.day_ts === selectedDay);
  }, [selectedDay, view, filteredPumpDaily, filteredTankDaily]);

  const filteredDayEvents = useMemo(() => {
    const search = eventSearch.trim().toLowerCase();
    const minSeconds = toNum(minDurationMinutes, 0) * 60;

    return dayEvents.filter((event: any) => {
      if (view === "pumps") {
        if (selectedPumpSet && !selectedPumpSet.has(Number(event.pump_id))) {
          return false;
        }

        if (eventTypeFilter !== "all" && event.state !== eventTypeFilter) {
          return false;
        }
      } else {
        if (selectedTankSet && !selectedTankSet.has(Number(event.tank_id))) {
          return false;
        }

        if (
          eventTypeFilter !== "all" &&
          event.event_type !== eventTypeFilter
        ) {
          return false;
        }

        if (
          eventStatusFilter !== "all" &&
          event.status !== eventStatusFilter
        ) {
          return false;
        }
      }

      if (eventHourFrom || eventHourTo) {
        const hhmm = localHHMM(event.started_at);

        if (eventHourFrom && hhmm && hhmm < eventHourFrom) {
          return false;
        }

        if (eventHourTo && hhmm && hhmm > eventHourTo) {
          return false;
        }
      }

      if (minSeconds > 0 && toNum(event.duration_seconds) < minSeconds) {
        return false;
      }

      if (search) {
        const text =
          view === "pumps"
            ? `${event.pump_name || ""} ${event.location_name || ""} ${
                event.state_label || ""
              }`
            : `${event.tank_name || ""} ${event.location_name || ""} ${
                event.event_label || ""
              } ${event.status_label || ""}`;

        if (!text.toLowerCase().includes(search)) {
          return false;
        }
      }

      return true;
    });
  }, [
    dayEvents,
    eventHourFrom,
    eventHourTo,
    eventSearch,
    eventStatusFilter,
    eventTypeFilter,
    minDurationMinutes,
    selectedPumpSet,
    selectedTankSet,
    view,
  ]);

  const sortedRanking = useMemo(() => {
    const rows =
      view === "pumps" ? [...filteredPumpRanking] : [...filteredTankRanking];

    rows.sort((a: any, b: any) => {
      const av = toNum(a[sortKey], -999999);
      const bv = toNum(b[sortKey], -999999);

      return sortDir === "asc" ? av - bv : bv - av;
    });

    return rows;
  }, [view, filteredPumpRanking, filteredTankRanking, sortKey, sortDir]);

  const summary = useMemo(() => {
    if (view === "pumps") {
      const starts = filteredPumpDaily.reduce(
        (acc, r) => acc + toNum(r.starts_count),
        0
      );
      const stops = filteredPumpDaily.reduce(
        (acc, r) => acc + toNum(r.stops_count),
        0
      );
      const severe = filteredPumpRanking.filter(
        (r) => r.estado_operativo !== "normal"
      ).length;
      const availabilityRows = filteredPumpDaily.filter(
        (r) => r.availability_pct !== null
      );
      const avgAvailability =
        availabilityRows.length > 0
          ? availabilityRows.reduce(
              (acc, r) => acc + toNum(r.availability_pct),
              0
            ) / availabilityRows.length
          : null;

      return {
        a: fmtInt(starts),
        b: fmtInt(stops),
        c: avgAvailability === null ? "-" : fmtPct(avgAvailability),
        d: fmtInt(severe),
        toneA: starts >= 80 ? "red" : starts >= 30 ? "orange" : "blue",
        toneB: "slate",
        toneC:
          avgAvailability !== null && avgAvailability < 40
            ? "orange"
            : "emerald",
        toneD: severe > 0 ? "orange" : "emerald",
      };
    }

    const events = filteredTankDaily.reduce(
      (acc, r) => acc + toNum(r.total_events),
      0
    );
    const critical = filteredTankDaily.reduce(
      (acc, r) =>
        acc + toNum(r.low_critical_events) + toNum(r.high_critical_events),
      0
    );
    const active = filteredTankDaily.reduce(
      (acc, r) => acc + toNum(r.active_events),
      0
    );
    const duration = filteredTankDaily.reduce(
      (acc, r) => acc + toNum(r.total_duration_seconds),
      0
    );

    return {
      a: fmtInt(events),
      b: fmtInt(critical),
      c: fmtInt(active),
      d: fmtHours(duration),
      toneA: events >= 50 ? "red" : events >= 20 ? "orange" : "blue",
      toneB: critical > 0 ? "orange" : "emerald",
      toneC: active > 0 ? "red" : "emerald",
      toneD: "slate",
    };
  }, [view, filteredPumpDaily, filteredPumpRanking, filteredTankDaily]);

  function toggleSort(key: string) {
    if (sortKey === key) {
      setSortDir((prev) => (prev === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  function changeView(next: ViewMode) {
    setView(next);
    setSelectedDay(null);
    setDayEvents([]);
    setEventError("");
    resetEventFilters();
    setSortKey("problem_score");
    setSortDir("desc");
  }

  const hasRankingData = sortedRanking.length > 0;

  return (
    <div className="space-y-5">
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Operación y confiabilidad
            </div>
            <h2 className="mt-1 text-2xl font-black tracking-tight text-slate-950">
              Seguimiento mensual de {view === "pumps" ? "bombas" : "tanques"}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Gráfico mensual, ranking operativo e historial horario al seleccionar un día.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-1">
              <button
                type="button"
                onClick={() => changeView("pumps")}
                className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                  view === "pumps"
                    ? "bg-slate-950 text-white shadow-sm"
                    : "text-slate-600 hover:bg-white"
                }`}
              >
                Bombas
              </button>
              <button
                type="button"
                onClick={() => changeView("tanks")}
                className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                  view === "tanks"
                    ? "bg-slate-950 text-white shadow-sm"
                    : "text-slate-600 hover:bg-white"
                }`}
              >
                Tanques
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                setMonth(prevMonth(month));
                clearSelectedDay();
              }}
              className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              ← Mes anterior
            </button>

            <input
              type="month"
              value={month}
              onChange={(e) => {
                setMonth(e.target.value);
                clearSelectedDay();
              }}
              className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm outline-none"
            />

            <button
              type="button"
              onClick={() => {
                setMonth(nextMonth(month));
                clearSelectedDay();
              }}
              className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              Mes siguiente →
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-500">
          <span className="rounded-full bg-slate-100 px-3 py-1">
            Ubicación: {locationId === "all" ? "Todas" : locationId}
          </span>
          <span className="rounded-full bg-slate-100 px-3 py-1">
            Mes: {month}
          </span>
          <span className="rounded-full bg-slate-100 px-3 py-1">
            Selectores superiores aplicados
          </span>
        </div>
      </section>

      {error ? (
        <section className="rounded-3xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
          {error}
        </section>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {view === "pumps" ? (
          <>
            <KpiCard
              label="Arranques"
              value={summary.a}
              help="Total del mes filtrado"
              tone={summary.toneA as any}
            />
            <KpiCard
              label="Paradas"
              value={summary.b}
              help="Eventos de apagado"
              tone={summary.toneB as any}
            />
            <KpiCard
              label="Disponibilidad prom."
              value={summary.c}
              help="Promedio de días con datos"
              tone={summary.toneC as any}
            />
            <KpiCard
              label="Bombas a revisar"
              value={summary.d}
              help="Estados distintos de normal"
              tone={summary.toneD as any}
            />
          </>
        ) : (
          <>
            <KpiCard
              label="Eventos"
              value={summary.a}
              help="Total del mes filtrado"
              tone={summary.toneA as any}
            />
            <KpiCard
              label="Críticos"
              value={summary.b}
              help="Low-low + high-high"
              tone={summary.toneB as any}
            />
            <KpiCard
              label="Activos"
              value={summary.c}
              help="Eventos todavía activos"
              tone={summary.toneC as any}
            />
            <KpiCard
              label="Duración acum."
              value={summary.d}
              help="Tiempo total de eventos"
              tone={summary.toneD as any}
            />
          </>
        )}
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div>
            <h3 className="text-lg font-black text-slate-950">
              {view === "pumps"
                ? "Arranques, paradas y disponibilidad por día"
                : "Eventos de tanques por día"}
            </h3>
            <p className="text-sm text-slate-500">
              Tocá una barra para reemplazar el ranking inferior por el historial horario del día.
            </p>
          </div>

          {selectedDay ? (
            <button
              type="button"
              onClick={clearSelectedDay}
              className="rounded-2xl bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200"
            >
              Ver ranking mensual
            </button>
          ) : null}
        </div>

        <div className="h-[380px]">
          {loading ? (
            <div className="flex h-full items-center justify-center rounded-2xl bg-slate-50 text-sm text-slate-500">
              Cargando datos...
            </div>
          ) : chartData.length === 0 ? (
            <div className="flex h-full items-center justify-center rounded-2xl bg-slate-50 text-sm text-slate-500">
              No hay datos para este mes o filtro.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={chartData.map((r) => ({
                  ...r,
                  day_label: dayLabel(r.day_ts),
                }))}
                margin={{ top: 12, right: 18, left: -8, bottom: 0 }}
                onClick={(state: any) => {
                  const day = state?.activePayload?.[0]?.payload?.day_ts;
                  if (day) selectDay(day);
                }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="day_label" tick={{ fontSize: 12 }} />
                <YAxis yAxisId="left" tick={{ fontSize: 12 }} />

                {view === "pumps" ? (
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    domain={[0, 100]}
                    tick={{ fontSize: 12 }}
                  />
                ) : null}

                <Tooltip content={<CustomTooltip />} />
                <Legend />

                {view === "pumps" ? (
                  <>
                    <Bar
                      yAxisId="left"
                      name="Arranques"
                      dataKey="total_starts"
                      fill="#2563eb"
                      radius={[8, 8, 0, 0]}
                    />
                    <Bar
                      yAxisId="left"
                      name="Paradas"
                      dataKey="total_stops"
                      fill="#94a3b8"
                      radius={[8, 8, 0, 0]}
                    />
                    <Line
                      yAxisId="right"
                      name="Disponibilidad %"
                      type="monotone"
                      dataKey="avg_availability_pct"
                      stroke="#16a34a"
                      strokeWidth={3}
                      dot={{ r: 4 }}
                    />
                  </>
                ) : (
                  <>
                    <Bar
                      name="Bajo"
                      dataKey="low_events"
                      stackId="events"
                      fill="#60a5fa"
                    />
                    <Bar
                      name="Bajo crítico"
                      dataKey="low_critical_events"
                      stackId="events"
                      fill="#1d4ed8"
                    />
                    <Bar
                      name="Alto"
                      dataKey="high_events"
                      stackId="events"
                      fill="#fb923c"
                    />
                    <Bar
                      name="Alto crítico"
                      dataKey="high_critical_events"
                      stackId="events"
                      fill="#dc2626"
                      radius={[8, 8, 0, 0]}
                    />
                  </>
                )}
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        {!selectedDay ? (
          <>
            <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
              <div>
                <h3 className="text-lg font-black text-slate-950">
                  Ranking mensual
                </h3>
                <p className="text-sm text-slate-500">
                  Sin seleccionar un día, se muestra lo más problemático del mes.
                </p>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {sortedRanking.slice(0, 8).map((r: any, index) => {
                const score = toNum(r.problem_score);
                const name = view === "pumps" ? r.pump_name : r.tank_name;
                const metric =
                  view === "pumps"
                    ? `${fmtInt(r.starts_count)} arranques · ${fmtPct(
                        r.availability_pct
                      )}`
                    : `${fmtInt(r.total_events)} eventos · ${fmtInt(
                        toNum(r.low_critical_events) +
                          toNum(r.high_critical_events)
                      )} críticos`;

                return (
                  <div
                    key={`${view}-ranking-${index}-${name}`}
                    className="rounded-2xl border border-slate-200 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-bold text-slate-900">{name}</div>
                        <div className="text-xs text-slate-500">
                          {r.location_name || "Sin ubicación"}
                        </div>
                        <div className="mt-1 text-sm text-slate-600">
                          {metric}
                        </div>
                      </div>

                      <span
                        className={`rounded-full border px-2.5 py-1 text-xs font-bold ${statusStyle(
                          r.estado_operativo
                        )}`}
                      >
                        {r.estado_operativo}
                      </span>
                    </div>

                    <div className="mt-3 h-2 rounded-full bg-slate-100">
                      <div
                        className={`h-2 rounded-full ${problemBarClass(score)}`}
                        style={{
                          width: `${Math.min(100, Math.max(4, score))}%`,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <>
            <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
              <div>
                <h3 className="text-lg font-black text-slate-950">
                  Historial horario del {dayLabel(selectedDay)}
                </h3>
                <p className="text-sm text-slate-500">
                  {view === "pumps"
                    ? "Encendidos, apagados, horarios y duración de cada estado."
                    : "Eventos de nivel, valores detectados, horarios y duración."}
                </p>
              </div>

              <button
                type="button"
                onClick={clearSelectedDay}
                className="rounded-2xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
              >
                Volver al ranking
              </button>
            </div>

            <div className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <input
                value={eventSearch}
                onChange={(e) => setEventSearch(e.target.value)}
                placeholder="Buscar equipo o ubicación"
                className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none"
              />

              <select
                value={eventTypeFilter}
                onChange={(e) => setEventTypeFilter(e.target.value)}
                className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none"
              >
                <option value="all">Todos los tipos</option>
                {view === "pumps" ? (
                  <>
                    <option value="run">Encendida</option>
                    <option value="stop">Apagada</option>
                  </>
                ) : (
                  <>
                    <option value="low">Nivel bajo</option>
                    <option value="low_low">Nivel bajo crítico</option>
                    <option value="high">Nivel alto</option>
                    <option value="high_high">Nivel alto crítico</option>
                  </>
                )}
              </select>

              {view === "tanks" ? (
                <select
                  value={eventStatusFilter}
                  onChange={(e) => setEventStatusFilter(e.target.value)}
                  className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none"
                >
                  <option value="all">Todos los estados</option>
                  <option value="active">Activo</option>
                  <option value="normalized">Normalizado</option>
                </select>
              ) : (
                <div className="hidden xl:block" />
              )}

              <div className="flex gap-2">
                <input
                  type="time"
                  value={eventHourFrom}
                  onChange={(e) => setEventHourFrom(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none"
                  title="Desde"
                />
                <input
                  type="time"
                  value={eventHourTo}
                  onChange={(e) => setEventHourTo(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none"
                  title="Hasta"
                />
              </div>

              <input
                type="number"
                min={0}
                value={minDurationMinutes}
                onChange={(e) => setMinDurationMinutes(e.target.value)}
                placeholder="Duración mín. min"
                className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none"
              />
            </div>

            <div className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {view === "pumps" ? (
                <>
                  <KpiCard
                    label="Eventos del día"
                    value={fmtInt(filteredDayEvents.length)}
                    help="Encendidos y apagados filtrados"
                    tone="blue"
                  />
                  <KpiCard
                    label="Encendidos"
                    value={fmtInt(
                      filteredDayEvents.filter(
                        (e: any) => e.state === "run"
                      ).length
                    )}
                    help="Estados run"
                    tone="emerald"
                  />
                  <KpiCard
                    label="Apagados"
                    value={fmtInt(
                      filteredDayEvents.filter(
                        (e: any) => e.state === "stop"
                      ).length
                    )}
                    help="Estados stop"
                    tone="slate"
                  />
                  <KpiCard
                    label="Duración acum."
                    value={fmtHours(
                      filteredDayEvents.reduce(
                        (acc: number, e: any) =>
                          acc + toNum(e.duration_seconds),
                        0
                      )
                    )}
                    help="Tiempo total filtrado"
                    tone="orange"
                  />
                </>
              ) : (
                <>
                  <KpiCard
                    label="Eventos del día"
                    value={fmtInt(filteredDayEvents.length)}
                    help="Eventos filtrados"
                    tone="blue"
                  />
                  <KpiCard
                    label="Críticos"
                    value={fmtInt(
                      filteredDayEvents.filter((e: any) =>
                        ["low_low", "high_high"].includes(e.event_type)
                      ).length
                    )}
                    help="Bajo crítico + alto crítico"
                    tone="orange"
                  />
                  <KpiCard
                    label="Activos"
                    value={fmtInt(
                      filteredDayEvents.filter(
                        (e: any) => e.status === "active"
                      ).length
                    )}
                    help="Sin normalizar"
                    tone="red"
                  />
                  <KpiCard
                    label="Duración acum."
                    value={fmtHours(
                      filteredDayEvents.reduce(
                        (acc: number, e: any) =>
                          acc + toNum(e.duration_seconds),
                        0
                      )
                    )}
                    help="Tiempo total filtrado"
                    tone="slate"
                  />
                </>
              )}
            </div>

            {eventError ? (
              <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                {eventError}
              </div>
            ) : null}

            <div className="overflow-x-auto rounded-2xl border border-slate-200">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-4 py-3 text-left font-bold">Hora</th>
                    <th className="px-4 py-3 text-left font-bold">Equipo</th>
                    <th className="px-4 py-3 text-left font-bold">
                      Ubicación
                    </th>
                    <th className="px-4 py-3 text-left font-bold">Evento</th>
                    {view === "tanks" ? (
                      <th className="px-4 py-3 text-right font-bold">
                        Valor / límite
                      </th>
                    ) : null}
                    <th className="px-4 py-3 text-right font-bold">
                      Fin
                    </th>
                    <th className="px-4 py-3 text-right font-bold">
                      Duración
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {loadingEvents ? (
                    <tr>
                      <td
                        colSpan={view === "tanks" ? 7 : 6}
                        className="px-4 py-10 text-center text-slate-500"
                      >
                        Cargando historial...
                      </td>
                    </tr>
                  ) : filteredDayEvents.length === 0 ? (
                    <tr>
                      <td
                        colSpan={view === "tanks" ? 7 : 6}
                        className="px-4 py-10 text-center text-slate-500"
                      >
                        No hay eventos para los filtros aplicados.
                      </td>
                    </tr>
                  ) : (
                    filteredDayEvents
                      .slice()
                      .sort(
                        (a: any, b: any) =>
                          new Date(a.started_at).getTime() -
                          new Date(b.started_at).getTime()
                      )
                      .map((event: any) => {
                        const label =
                          view === "pumps"
                            ? event.state_label
                            : event.event_label;

                        const equipment =
                          view === "pumps"
                            ? event.pump_name
                            : event.tank_name;

                        const rawType =
                          view === "pumps" ? event.state : event.event_type;

                        return (
                          <tr
                            key={`${view}-event-${event.id}`}
                            className="border-t border-slate-200 hover:bg-slate-50"
                          >
                            <td className="px-4 py-4 font-bold text-slate-900">
                              {localTime(event.started_at)}
                            </td>
                            <td className="px-4 py-4 font-semibold text-slate-900">
                              {equipment || "-"}
                            </td>
                            <td className="px-4 py-4 text-slate-600">
                              {event.location_name || "-"}
                            </td>
                            <td className="px-4 py-4">
                              <span
                                className={`rounded-full border px-3 py-1 text-xs font-bold ${eventStyle(
                                  rawType || label
                                )}`}
                              >
                                {label || "-"}
                              </span>
                            </td>

                            {view === "tanks" ? (
                              <td className="px-4 py-4 text-right">
                                <span className="font-bold text-slate-900">
                                  {fmtNum(event.detected_value, 2)}
                                </span>
                                <span className="text-slate-400">
                                  {" "}
                                  / {fmtNum(event.configured_limit, 2)}
                                </span>
                              </td>
                            ) : null}

                            <td className="px-4 py-4 text-right text-slate-600">
                              {event.ended_at
                                ? localDateTime(event.ended_at)
                                : "Activo"}
                            </td>
                            <td className="px-4 py-4 text-right font-semibold">
                              {event.duration_label ||
                                fmtHours(event.duration_seconds)}
                            </td>
                          </tr>
                        );
                      })
                  )}
                </tbody>
              </table>
            </div>

            {selectedDayDailyRows.length > 0 ? (
              <div className="mt-5 rounded-2xl bg-slate-50 p-4">
                <h4 className="mb-3 text-sm font-black uppercase tracking-wide text-slate-500">
                  Resumen agregado del día
                </h4>

                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  {selectedDayDailyRows
                    .slice()
                    .sort((a: any, b: any) =>
                      view === "pumps"
                        ? toNum(b.problem_score) - toNum(a.problem_score)
                        : toNum(b.total_events) - toNum(a.total_events)
                    )
                    .slice(0, 8)
                    .map((row: any) => (
                      <div
                        key={`${selectedDay}-summary-${
                          view === "pumps" ? row.pump_id : row.tank_id
                        }`}
                        className="rounded-2xl border border-slate-200 bg-white p-4"
                      >
                        <div className="font-bold text-slate-900">
                          {view === "pumps" ? row.pump_name : row.tank_name}
                        </div>
                        <div className="text-xs text-slate-500">
                          {row.location_name || "Sin ubicación"}
                        </div>

                        <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                          {view === "pumps" ? (
                            <>
                              <div className="rounded-xl bg-slate-50 p-2">
                                <div className="text-slate-500">
                                  Arranques
                                </div>
                                <div className="font-black">
                                  {fmtInt(row.starts_count)}
                                </div>
                              </div>
                              <div className="rounded-xl bg-slate-50 p-2">
                                <div className="text-slate-500">
                                  Disp.
                                </div>
                                <div className="font-black">
                                  {fmtPct(row.availability_pct)}
                                </div>
                              </div>
                              <div className="rounded-xl bg-slate-50 p-2">
                                <div className="text-slate-500">
                                  Score
                                </div>
                                <div className="font-black">
                                  {fmtInt(row.problem_score)}
                                </div>
                              </div>
                            </>
                          ) : (
                            <>
                              <div className="rounded-xl bg-slate-50 p-2">
                                <div className="text-slate-500">
                                  Eventos
                                </div>
                                <div className="font-black">
                                  {fmtInt(row.total_events)}
                                </div>
                              </div>
                              <div className="rounded-xl bg-slate-50 p-2">
                                <div className="text-slate-500">
                                  Críticos
                                </div>
                                <div className="font-black">
                                  {fmtInt(
                                    toNum(row.low_critical_events) +
                                      toNum(row.high_critical_events)
                                  )}
                                </div>
                              </div>
                              <div className="rounded-xl bg-slate-50 p-2">
                                <div className="text-slate-500">
                                  Duración
                                </div>
                                <div className="font-black">
                                  {fmtHours(row.total_duration_seconds)}
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            ) : null}
          </>
        )}
      </section>

      {!selectedDay ? (
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <h3 className="text-lg font-black text-slate-950">
                Tabla ordenable de {view === "pumps" ? "bombas" : "tanques"}
              </h3>
              <p className="text-sm text-slate-500">
                Tocá una columna para ordenar por disponibilidad, arranques, eventos o score.
              </p>
            </div>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3 text-left font-bold">Equipo</th>
                  <th className="px-4 py-3 text-left font-bold">
                    Ubicación
                  </th>

                  {view === "pumps" ? (
                    <>
                      <th
                        onClick={() => toggleSort("starts_count")}
                        className="cursor-pointer px-4 py-3 text-right font-bold hover:bg-slate-100"
                      >
                        Arranques
                      </th>
                      <th
                        onClick={() => toggleSort("stops_count")}
                        className="cursor-pointer px-4 py-3 text-right font-bold hover:bg-slate-100"
                      >
                        Paradas
                      </th>
                      <th
                        onClick={() => toggleSort("availability_pct")}
                        className="cursor-pointer px-4 py-3 text-right font-bold hover:bg-slate-100"
                      >
                        Disponibilidad
                      </th>
                      <th
                        onClick={() => toggleSort("problem_score")}
                        className="cursor-pointer px-4 py-3 text-right font-bold hover:bg-slate-100"
                      >
                        Score
                      </th>
                    </>
                  ) : (
                    <>
                      <th
                        onClick={() => toggleSort("total_events")}
                        className="cursor-pointer px-4 py-3 text-right font-bold hover:bg-slate-100"
                      >
                        Eventos
                      </th>
                      <th
                        onClick={() => toggleSort("low_critical_events")}
                        className="cursor-pointer px-4 py-3 text-right font-bold hover:bg-slate-100"
                      >
                        Bajo crítico
                      </th>
                      <th
                        onClick={() => toggleSort("high_critical_events")}
                        className="cursor-pointer px-4 py-3 text-right font-bold hover:bg-slate-100"
                      >
                        Alto crítico
                      </th>
                      <th
                        onClick={() => toggleSort("problem_score")}
                        className="cursor-pointer px-4 py-3 text-right font-bold hover:bg-slate-100"
                      >
                        Score
                      </th>
                    </>
                  )}

                  <th className="px-4 py-3 text-right font-bold">Estado</th>
                </tr>
              </thead>

              <tbody>
                {!hasRankingData ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-4 py-10 text-center text-slate-500"
                    >
                      No hay datos para mostrar.
                    </td>
                  </tr>
                ) : (
                  sortedRanking.map((r: any) => (
                    <tr
                      key={`${view}-${
                        view === "pumps" ? r.pump_id : r.tank_id
                      }`}
                      className="border-t border-slate-200 hover:bg-slate-50"
                    >
                      <td className="px-4 py-4 font-bold text-slate-900">
                        {view === "pumps" ? r.pump_name : r.tank_name}
                      </td>
                      <td className="px-4 py-4 text-slate-600">
                        {r.location_name || "-"}
                      </td>

                      {view === "pumps" ? (
                        <>
                          <td className="px-4 py-4 text-right">
                            {fmtInt(r.starts_count)}
                          </td>
                          <td className="px-4 py-4 text-right">
                            {fmtInt(r.stops_count)}
                          </td>
                          <td className="px-4 py-4 text-right font-semibold">
                            {fmtPct(r.availability_pct)}
                          </td>
                          <td className="px-4 py-4 text-right font-black">
                            {fmtInt(r.problem_score)}
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-4 py-4 text-right">
                            {fmtInt(r.total_events)}
                          </td>
                          <td className="px-4 py-4 text-right">
                            {fmtInt(r.low_critical_events)}
                          </td>
                          <td className="px-4 py-4 text-right">
                            {fmtInt(r.high_critical_events)}
                          </td>
                          <td className="px-4 py-4 text-right font-black">
                            {fmtInt(r.problem_score)}
                          </td>
                        </>
                      )}

                      <td className="px-4 py-4 text-right">
                        <span
                          className={`rounded-full border px-3 py-1 text-xs font-bold ${statusStyle(
                            r.estado_operativo
                          )}`}
                        >
                          {r.estado_operativo}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}