import React from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";

type Trend = "subiendo" | "estable" | "bajando";
type StateTone = "normal" | "atencion" | "critico";

type ImpulsionPoint = {
  label: string;
  operando: number;
  disponible: number;
};

type DistributionPoint = {
  label: string;
  nivel: number;
  referencia?: number;
};

type PumpDetail = {
  nombre: string;
  estado: "ON" | "OFF" | "OFFLINE";
  horasEncendida: string;
  arranques: number;
};

type TankDetail = {
  nombre: string;
  nivelActual: string;
  tendencia: Trend;
};

export type WaterNetworkOverviewProps = {
  ubicacionLabel?: string;
  periodoLabel?: string;
  actualizadoLabel?: string;
  estadoGeneral?: StateTone;
  mensajeGeneral?: string;

  impulsion: {
    operando: string;
    utilizacion: string;
    disponibilidad: string;
    estado: StateTone;
    data: ImpulsionPoint[];
    detalle: PumpDetail[];
  };

  distribucion: {
    nivelPromedio: string;
    actual: string;
    bajos: number;
    criticos: number;
    estado: StateTone;
    tendenciaLabel?: string;
    data: DistributionPoint[];
    detalle: TankDetail[];
  };

  conclusiones: string[];
};

const toneMap: Record<StateTone, string> = {
  normal: "bg-emerald-50 text-emerald-700 border-emerald-200",
  atencion: "bg-amber-50 text-amber-700 border-amber-200",
  critico: "bg-red-50 text-red-700 border-red-200",
};

const toneTextMap: Record<StateTone, string> = {
  normal: "NORMAL",
  atencion: "ATENCIÓN",
  critico: "CRÍTICO",
};

const trendMap: Record<Trend, string> = {
  subiendo: "↑ Subiendo",
  estable: "• Estable",
  bajando: "↓ Bajando",
};

function CardBadge({ tone }: { tone: StateTone }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${toneMap[tone]}`}>
      {toneTextMap[tone]}
    </span>
  );
}

function SimpleTooltip({ active, payload, label, suffix = "" }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-xl">
      <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">{label}</div>
      <div className="mt-1 space-y-1">
        {payload.map((p: any, idx: number) => (
          <div key={idx} className="flex items-center justify-between gap-6 text-xs">
            <span className="text-slate-500">{p.name}</span>
            <span className="font-semibold text-slate-900">{p.value}{suffix}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Header({ ubicacionLabel = "Todas", periodoLabel = "24 h", actualizadoLabel = "actualizado 01:07", estadoGeneral = "atencion", mensajeGeneral = "La impulsión tiene margen disponible mientras el almacenamiento principal está descendiendo." }: Pick<WaterNetworkOverviewProps, "ubicacionLabel" | "periodoLabel" | "actualizadoLabel" | "estadoGeneral" | "mensajeGeneral">) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-5 py-3 text-sm">
        <div className="text-slate-500">Ubicación:</div>
        <div className="rounded-xl border border-slate-300 px-4 py-2 font-medium text-slate-700">{ubicacionLabel}</div>
        <div className="rounded-xl border border-slate-300 px-4 py-2 font-medium text-slate-700">{periodoLabel}</div>
        <div className="text-slate-500">{actualizadoLabel}</div>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4 px-5 py-5">
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-950 text-white text-2xl">💧</div>
          <div>
            <div className="text-4xl font-bold tracking-tight text-slate-900">Red de agua</div>
            <div className="mt-1 max-w-3xl text-lg text-slate-500">{mensajeGeneral}</div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-lg font-semibold text-slate-700">Estado general</div>
          <CardBadge tone={estadoGeneral} />
        </div>
      </div>
    </div>
  );
}

function ImpulsionPanel({ data, operando, utilizacion, disponibilidad, estado, detalle }: WaterNetworkOverviewProps["impulsion"]) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-950 text-white text-2xl">⚙</div>
            <div>
              <div className="text-2xl font-bold text-slate-900">Impulsión</div>
              <div className="text-sm text-slate-500">Bombas principales</div>
            </div>
          </div>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-4">
        <div>
          <div className="text-6xl font-extrabold tracking-tight text-blue-700">{operando}</div>
          <div className="mt-1 text-lg uppercase tracking-[0.14em] text-slate-500">Operando</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="text-sm text-slate-500">Utilización</div>
          <div className="mt-1 text-4xl font-bold text-slate-900">{utilizacion}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="text-sm text-slate-500">Disponibilidad</div>
          <div className="mt-1 text-4xl font-bold text-slate-900">{disponibilidad}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="text-sm text-slate-500">Estado</div>
          <div className="mt-3"><CardBadge tone={estado} /></div>
        </div>
      </div>

      <div className="mb-2 text-sm font-semibold text-slate-700">Últimas 24 h</div>
      <div className="h-64 rounded-xl border border-slate-100 bg-slate-50 p-2">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="#e7edf4" strokeDasharray="3 5" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={{ stroke: "#dbe3ec" }} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "#64748b" }} tickFormatter={(v) => `${v}%`} tickLine={false} axisLine={false} width={36} />
            <Tooltip content={<SimpleTooltip suffix="%" />} />
            <Line type="monotone" dataKey="operando" name="Bombas operando" stroke="#2563eb" strokeWidth={3} dot={false} />
            <Line type="monotone" dataKey="disponible" name="Capacidad disponible" stroke="#94a3b8" strokeDasharray="6 6" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-4 text-sm font-semibold text-slate-700">Detalle de bombas principales</div>
      <div className="mt-2 overflow-hidden rounded-xl border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-3 py-2 font-semibold">Bomba</th>
              <th className="px-3 py-2 font-semibold">Estado</th>
              <th className="px-3 py-2 font-semibold">h encendida</th>
              <th className="px-3 py-2 font-semibold">Arranques</th>
            </tr>
          </thead>
          <tbody>
            {detalle.map((row) => (
              <tr key={row.nombre} className="border-t border-slate-100">
                <td className="px-3 py-2 text-slate-800">{row.nombre}</td>
                <td className="px-3 py-2">
                  <span className={`inline-flex items-center gap-2 font-medium ${row.estado === "ON" ? "text-emerald-700" : "text-slate-500"}`}>
                    <span className={`h-2.5 w-2.5 rounded-full ${row.estado === "ON" ? "bg-emerald-500" : "bg-slate-400"}`} />
                    {row.estado}
                  </span>
                </td>
                <td className="px-3 py-2 text-slate-700">{row.horasEncendida}</td>
                <td className="px-3 py-2 text-slate-700">{row.arranques}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DistributionPanel({ data, nivelPromedio, actual, bajos, criticos, estado, tendenciaLabel = "Tendencia ↓", detalle }: WaterNetworkOverviewProps["distribucion"]) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-950 text-white text-2xl">◻</div>
            <div>
              <div className="text-2xl font-bold text-slate-900">Distribución</div>
              <div className="text-sm text-slate-500">Tanques principales</div>
            </div>
          </div>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-4 md:grid-cols-5">
        <div className="col-span-2 md:col-span-1">
          <div className="text-6xl font-extrabold tracking-tight text-blue-700">{nivelPromedio}</div>
          <div className="mt-1 text-lg uppercase tracking-[0.14em] text-slate-500">Nivel promedio</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="text-sm text-slate-500">Actual</div>
          <div className="mt-1 text-4xl font-bold text-slate-900">{actual}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="text-sm text-slate-500">Tanques bajos</div>
          <div className="mt-1 text-4xl font-bold text-amber-600">{bajos}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="text-sm text-slate-500">Críticos</div>
          <div className="mt-1 text-4xl font-bold text-red-600">{criticos}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="text-sm text-slate-500">Estado</div>
          <div className="mt-3"><CardBadge tone={estado} /></div>
        </div>
      </div>

      <div className="mb-2 flex items-center justify-between gap-4 text-sm">
        <div className="font-semibold text-slate-700">Últimas 24 h</div>
        <div className="text-amber-600 font-medium">{tendenciaLabel}</div>
      </div>
      <div className="h-64 rounded-xl border border-slate-100 bg-slate-50 p-2">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="#e7edf4" strokeDasharray="3 5" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={{ stroke: "#dbe3ec" }} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "#64748b" }} tickFormatter={(v) => `${v}%`} tickLine={false} axisLine={false} width={36} />
            <Tooltip content={<SimpleTooltip suffix="%" />} />
            <Line type="monotone" dataKey="nivel" name="Nivel promedio" stroke="#2563eb" strokeWidth={3} dot={false} />
            <Line type="monotone" dataKey="referencia" name="Promedio de referencia" stroke="#94a3b8" strokeDasharray="6 6" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-4 text-sm font-semibold text-slate-700">Detalle de tanques principales</div>
      <div className="mt-2 overflow-hidden rounded-xl border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-3 py-2 font-semibold">Tanque</th>
              <th className="px-3 py-2 font-semibold">Nivel actual</th>
              <th className="px-3 py-2 font-semibold">Tendencia</th>
            </tr>
          </thead>
          <tbody>
            {detalle.map((row) => (
              <tr key={row.nombre} className="border-t border-slate-100">
                <td className="px-3 py-2 text-slate-800">{row.nombre}</td>
                <td className="px-3 py-2 text-slate-700">{row.nivelActual}</td>
                <td className="px-3 py-2 text-slate-700">{trendMap[row.tendencia]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ConclusionStrip({ conclusiones }: { conclusiones: string[] }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-3 pr-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-950 text-white text-2xl">☑</div>
          <div className="text-2xl font-bold text-slate-900">Conclusión operativa</div>
        </div>
        {conclusiones.map((c, idx) => (
          <div key={idx} className="min-w-[220px] flex-1 border-l border-slate-200 pl-6 text-lg text-slate-700">
            <span className="mr-3 text-blue-700">•</span>{c}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function WaterNetworkOverview(props: WaterNetworkOverviewProps) {
  return (
    <div className="space-y-4">
      <Header
        ubicacionLabel={props.ubicacionLabel}
        periodoLabel={props.periodoLabel}
        actualizadoLabel={props.actualizadoLabel}
        estadoGeneral={props.estadoGeneral}
        mensajeGeneral={props.mensajeGeneral}
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ImpulsionPanel {...props.impulsion} />
        <DistributionPanel {...props.distribucion} />
      </div>

      <ConclusionStrip conclusiones={props.conclusiones} />
    </div>
  );
}
