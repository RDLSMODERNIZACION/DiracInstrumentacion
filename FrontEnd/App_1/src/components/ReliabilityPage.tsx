import { useEffect, useMemo, useState } from "react";
import { scopedUrl, getApiHeaders } from "@/lib/config";

/* ================= TYPES ================= */

type PumpOperation = {
  pump_id: number;
  pump_name: string;
  location_id: number | null;
  location_name: string | null;
  starts_count: number;
  stops_count: number;
  availability_pct: number | null;
};

type TankEvent = {
  id: number;
  tank_name: string;
  location_id: number | null;
  location_name: string | null;
  event_label: string;
  detected_value: number | null;
  status_label: string;
};

type DailyStarts = {
  date: string;
  total_starts: number;
  pumps: {
    pump_id: number;
    pump_name: string;
    starts: number;
  }[];
};

/* ================= FETCH ================= */

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(scopedUrl(path), {
    headers: getApiHeaders(),
  });
  if (!res.ok) throw new Error("error");
  return res.json();
}

/* ================= COMPONENT ================= */

export default function ReliabilityPage({
  locationId,
  selectedPumpIds,
  selectedTankIds,
}: {
  locationId: string;
  selectedPumpIds?: number[];
  selectedTankIds?: number[];
}) {
  const [view, setView] = useState<"pumps" | "tanks">("pumps");

  const [pumps, setPumps] = useState<PumpOperation[]>([]);
  const [tanks, setTanks] = useState<TankEvent[]>([]);
  const [daily, setDaily] = useState<DailyStarts[]>([]);

  const [selectedDay, setSelectedDay] = useState<DailyStarts | null>(null);

  const [sortKey, setSortKey] = useState<"starts" | "availability">("starts");
  const [sortAsc, setSortAsc] = useState(false);

  /* ================= LOAD ================= */

  useEffect(() => {
    async function load() {
      const [p, t] = await Promise.all([
        fetchJson<{ items: PumpOperation[] }>(
          "/kpi/operation-reliability/pumps"
        ),
        fetchJson<{ items: TankEvent[] }>(
          "/kpi/operation-reliability/tank-events"
        ),
      ]);

      setPumps(p.items || []);
      setTanks(t.items || []);

      // series (si existe)
      try {
        const d = await fetchJson<{ items: DailyStarts[] }>(
          "/kpi/operation-reliability/pump-starts-daily?days=31"
        );
        setDaily(d.items);
      } catch {
        // fallback
        setDaily(
          p.items.map((p) => ({
            date: "Hoy",
            total_starts: p.starts_count,
            pumps: [
              {
                pump_id: p.pump_id,
                pump_name: p.pump_name,
                starts: p.starts_count,
              },
            ],
          }))
        );
      }
    }

    load();
  }, []);

  /* ================= FILTER REAL (SUPERIOR) ================= */

  const filteredPumps = useMemo(() => {
    return pumps
      .filter((p) => {
        if (locationId !== "all" && String(p.location_id) !== locationId)
          return false;

        if (
          selectedPumpIds &&
          selectedPumpIds.length > 0 &&
          !selectedPumpIds.includes(p.pump_id)
        )
          return false;

        return true;
      })
      .sort((a, b) => {
        const aVal =
          sortKey === "starts" ? a.starts_count : a.availability_pct || 0;
        const bVal =
          sortKey === "starts" ? b.starts_count : b.availability_pct || 0;

        return sortAsc ? aVal - bVal : bVal - aVal;
      });
  }, [pumps, locationId, selectedPumpIds, sortKey, sortAsc]);

  const filteredTanks = useMemo(() => {
    return tanks.filter((t) => {
      if (locationId !== "all" && String(t.location_id) !== locationId)
        return false;

      if (
        selectedTankIds &&
        selectedTankIds.length > 0 &&
        !selectedTankIds.includes(Number(t.id))
      )
        return false;

      return true;
    });
  }, [tanks, locationId, selectedTankIds]);

  /* ================= HISTORIAL AUTOMATICO ================= */

  const worstPumps = useMemo(() => {
    return [...filteredPumps]
      .sort((a, b) => b.starts_count - a.starts_count)
      .slice(0, 5);
  }, [filteredPumps]);

  /* ================= UI ================= */

  return (
    <div className="space-y-6">
      {/* SELECTOR */}
      <div className="flex gap-3">
        <button
          onClick={() => setView("pumps")}
          className={view === "pumps" ? "btn-active" : "btn"}
        >
          Bombas
        </button>

        <button
          onClick={() => setView("tanks")}
          className={view === "tanks" ? "btn-active" : "btn"}
        >
          Tanques
        </button>
      </div>

      {/* ================= PUMPS ================= */}
      {view === "pumps" && (
        <>
          <h2 className="text-lg font-bold">
            Arranques diarios (comparación)
          </h2>

          {/* GRAFICO */}
          <div className="flex gap-2 h-40 items-end">
            {daily.map((d, i) => (
              <div
                key={i}
                className="bg-blue-500 w-6 cursor-pointer hover:bg-blue-700"
                style={{ height: d.total_starts * 4 }}
                onClick={() => setSelectedDay(d)}
                title={`${d.date} - ${d.total_starts}`}
              />
            ))}
          </div>

          {/* DETALLE */}
          <div className="border p-4 rounded">
            {selectedDay ? (
              <>
                <h3 className="font-bold mb-2">
                  {selectedDay.date}
                </h3>

                {selectedDay.pumps.map((p) => (
                  <div key={p.pump_id}>
                    {p.pump_name} → {p.starts}
                  </div>
                ))}
              </>
            ) : (
              <>
                <h3 className="font-bold mb-2">
                  Bombas más problemáticas
                </h3>

                {worstPumps.map((p) => (
                  <div key={p.pump_id}>
                    {p.pump_name} → {p.starts_count} arranques
                  </div>
                ))}
              </>
            )}
          </div>

          {/* TABLA ORDENABLE */}
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th>Bomba</th>

                <th
                  className="cursor-pointer"
                  onClick={() => {
                    setSortKey("starts");
                    setSortAsc(!sortAsc);
                  }}
                >
                  Arranques ⬍
                </th>

                <th
                  className="cursor-pointer"
                  onClick={() => {
                    setSortKey("availability");
                    setSortAsc(!sortAsc);
                  }}
                >
                  Disponibilidad ⬍
                </th>
              </tr>
            </thead>

            <tbody>
              {filteredPumps.map((p) => (
                <tr key={p.pump_id}>
                  <td>{p.pump_name}</td>
                  <td>{p.starts_count}</td>
                  <td>{p.availability_pct ?? "-"}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {/* ================= TANKS ================= */}
      {view === "tanks" && (
        <>
          <h2 className="text-lg font-bold">
            Eventos de tanques
          </h2>

          <table className="w-full text-sm">
            <thead>
              <tr>
                <th>Tanque</th>
                <th>Evento</th>
                <th>Valor</th>
                <th>Estado</th>
              </tr>
            </thead>

            <tbody>
              {filteredTanks.map((t) => (
                <tr key={t.id}>
                  <td>{t.tank_name}</td>
                  <td>{t.event_label}</td>
                  <td>{t.detected_value}</td>
                  <td>{t.status_label}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}