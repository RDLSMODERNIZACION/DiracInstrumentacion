import { useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { scopedUrl, getApiHeaders } from "@/lib/config";

/* ================= FETCH ================= */

async function fetchJson(path: string) {
  const res = await fetch(scopedUrl(path), {
    headers: getApiHeaders(),
  });
  if (!res.ok) throw new Error("Error cargando datos");
  return res.json();
}

/* ================= COMPONENT ================= */

export default function ReliabilityPage({
  locationId,
}: {
  locationId: string;
}) {
  const [view, setView] = useState<"pumps" | "tanks">("pumps");
  const [month, setMonth] = useState("2026-04");

  const [chart, setChart] = useState<any[]>([]);
  const [ranking, setRanking] = useState<any[]>([]);
  const [selectedDay, setSelectedDay] = useState<any>(null);

  const [loading, setLoading] = useState(false);

  /* ================= LOAD ================= */

  useEffect(() => {
    load();
  }, [view, month, locationId]);

  async function load() {
    setLoading(true);

    try {
      const base =
        view === "pumps"
          ? "/kpi/operation-reliability/pump"
          : "/kpi/operation-reliability/tank";

      const [c, r] = await Promise.all([
        fetchJson(
          `${base}-daily-chart?month=${month}&location_id=${locationId}`
        ),
        fetchJson(
          `${base}-ranking?month=${month}&location_id=${locationId}`
        ),
      ]);

      setChart(c.items || []);
      setRanking(r.items || []);
      setSelectedDay(null);
    } catch (e) {
      console.error(e);
    }

    setLoading(false);
  }

  /* ================= COLORS ================= */

  function getColor(row: any) {
    if (view === "pumps") {
      if (row.problem_score > 100) return "#ef4444";
      if (row.problem_score > 40) return "#f97316";
      if (row.problem_score > 20) return "#eab308";
      return "#22c55e";
    } else {
      if (row.total_events > 20) return "#ef4444";
      if (row.total_events > 10) return "#f97316";
      if (row.total_events > 5) return "#eab308";
      return "#22c55e";
    }
  }

  /* ================= RENDER ================= */

  return (
    <div className="p-6 space-y-6">

      {/* HEADER */}
      <div className="flex gap-4 items-center">
        <button
          onClick={() => setView("pumps")}
          className={`px-3 py-1 rounded ${
            view === "pumps" ? "bg-black text-white" : "bg-gray-200"
          }`}
        >
          Bombas
        </button>

        <button
          onClick={() => setView("tanks")}
          className={`px-3 py-1 rounded ${
            view === "tanks" ? "bg-black text-white" : "bg-gray-200"
          }`}
        >
          Tanques
        </button>

        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
        />
      </div>

      {/* LOADING */}
      {loading && <div>Cargando...</div>}

      {/* ================= GRAFICO ================= */}
      <div style={{ width: "100%", height: 300 }}>
        <ResponsiveContainer>
          <BarChart data={chart}>
            <XAxis dataKey="day_ts" />
            <YAxis />
            <Tooltip />

            <Bar
              dataKey={view === "pumps" ? "total_starts" : "total_events"}
              fill="#3b82f6"
              onClick={(data: any) => setSelectedDay(data)}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* ================= DETALLE ================= */}
      <div className="border p-4 rounded">
        {selectedDay ? (
          <>
            <h3 className="font-bold mb-2">
              Día: {selectedDay.day_ts}
            </h3>

            {view === "pumps" ? (
              <>
                Arranques: {selectedDay.total_starts}
                <br />
                Score: {selectedDay.total_problem_score}
              </>
            ) : (
              <>
                Eventos: {selectedDay.total_events}
                <br />
                Activos: {selectedDay.active_events}
              </>
            )}
          </>
        ) : (
          <>
            <h3 className="font-bold mb-2">
              Ranking (más problemáticos)
            </h3>

            {ranking.slice(0, 10).map((r, i) => (
              <div
                key={i}
                className="flex justify-between border-b py-1"
              >
                <span>
                  {view === "pumps"
                    ? r.pump_name
                    : r.tank_name}
                </span>

                <span>
                  {view === "pumps"
                    ? `${r.starts_count} arr / ${r.availability_pct}%`
                    : `${r.total_events} ev`}
                </span>
              </div>
            ))}
          </>
        )}
      </div>

      {/* ================= TABLA ================= */}
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th>Equipo</th>
            <th>Métrica</th>
            <th>Estado</th>
          </tr>
        </thead>

        <tbody>
          {ranking.map((r: any, i: number) => (
            <tr key={i}>
              <td>
                {view === "pumps"
                  ? r.pump_name
                  : r.tank_name}
              </td>

              <td>
                {view === "pumps"
                  ? `${r.starts_count} / ${r.availability_pct ?? "-"}%`
                  : `${r.total_events}`}
              </td>

              <td style={{ color: getColor(r) }}>
                {r.estado_operativo}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

    </div>
  );
}