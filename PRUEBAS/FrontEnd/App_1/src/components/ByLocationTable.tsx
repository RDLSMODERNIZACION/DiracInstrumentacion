import * as React from "react";

type Row = {
  location_id: number;
  location_code?: string | null;
  location_name: string;
  tanks_count?: number | null;
  pumps_count?: number | null;
  valves_count?: number | null;
  manifolds_count?: number | null;
};

export default function ByLocationTable({ rows }: { rows: Row[] }) {
  const safe = Array.isArray(rows) ? rows : [];

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full border-collapse">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-3 py-2 text-left">Localidad</th>
            <th className="px-3 py-2 text-right">Tanques</th>
            <th className="px-3 py-2 text-right">Bombas</th>
            <th className="px-3 py-2 text-right">Válvulas</th>
            <th className="px-3 py-2 text-right">Manifolds</th>
          </tr>
        </thead>
        <tbody>
          {safe.map((r, i) => (
            <tr key={r.location_id ?? i} className="border-t">
              <td className="px-3 py-2">{r.location_name}</td>
              <td className="px-3 py-2 text-right">{Number(r.tanks_count ?? 0)}</td>
              <td className="px-3 py-2 text-right">{Number(r.pumps_count ?? 0)}</td>
              <td className="px-3 py-2 text-right">{Number(r.valves_count ?? 0)}</td>
              <td className="px-3 py-2 text-right">{Number(r.manifolds_count ?? 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
