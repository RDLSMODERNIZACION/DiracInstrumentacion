// src/components/TankLevelChart.tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import React, { useMemo } from "react";
type TankTs = { timestamps?: string[]; level_percent?: Array<number | string | null> };
export function TankLevelChart({ ts }: { ts: TankTs | null }) {
  const series = useMemo(() => {
    const t = ts?.timestamps || [], lv = ts?.level_percent || [];
    const rows: { ts: string; nivel: number }[] = [];
    for (let i = 0; i < Math.min(t.length, lv.length); i++) {
      const n = Number(lv[i]);
      if (Number.isFinite(n)) rows.push({ ts: (t[i] ?? "").slice(11, 16), nivel: n });
    }
    return rows;
  }, [ts]);
  return (
    <Card className="rounded-2xl">
      <CardHeader className="pb-2"><CardTitle className="text-sm text-gray-500">Nivel del tanque (24h)</CardTitle></CardHeader>
      <CardContent className="h-56">
        {series.length ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={series} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="ts" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} domain={[0, 100]} />
              <Tooltip formatter={(v: any) => [`${Number(v).toFixed(0)}%`, "Nivel"]} />
              <Legend />
              <Line type="monotone" dataKey="nivel" dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full grid place-items-center text-sm text-gray-500">Sin datos</div>
        )}
      </CardContent>
    </Card>
  );
}
export default TankLevelChart;
