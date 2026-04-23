export default function OperacionConfiabilidadMockup() {
  const plantas = [
    {
      id: 1,
      nombre: "Planta Oeste 1",
      estadoGeneral: "Operativa",
      modo: "Automático",
      nivel: 72,
      presion: 4.8,
      caudal: 185,
      potenciaKw: 109.7,
      energiaKwh: 2630,
      eficiencia: 0.59,
      bombas: [
        { nombre: "Bomba 1", estado: "Marcha", horas: 12.4, arranques: 8, disponibilidad: 98.2, fallas: 0, mtbf: 420, mttr: 1.2 },
        { nombre: "Bomba 2", estado: "Reserva", horas: 6.1, arranques: 4, disponibilidad: 96.4, fallas: 1, mtbf: 280, mttr: 2.7 },
      ],
      alarmas: [
        { tipo: "info", texto: "Alternancia correcta entre bombas" },
        { tipo: "warn", texto: "Bomba 2 estuvo 35 min en manual" },
      ],
    },
    {
      id: 2,
      nombre: "Planta Oeste 2",
      estadoGeneral: "Operativa con observaciones",
      modo: "Automático",
      nivel: 81,
      presion: 5.2,
      caudal: 240,
      potenciaKw: 226.2,
      energiaKwh: 5110,
      eficiencia: 0.74,
      bombas: [
        { nombre: "Bomba 3", estado: "Marcha", horas: 15.1, arranques: 11, disponibilidad: 94.8, fallas: 1, mtbf: 210, mttr: 3.1 },
        { nombre: "Bomba 4", estado: "Parada", horas: 7.2, arranques: 6, disponibilidad: 91.3, fallas: 2, mtbf: 140, mttr: 4.5 },
      ],
      alarmas: [
        { tipo: "danger", texto: "Bomba 4 con reincidencia de falla térmica" },
        { tipo: "warn", texto: "Consumo específico alto respecto al caudal" },
      ],
    },
  ];

  const resumen = {
    disponibilidad: 95.2,
    arranquesHoy: 29,
    horasMarcha: 40.8,
    energiaDia: 7740,
    eficiencia: 0.68,
    fallasMes: 4,
    mtbf: 262,
    mttr: 2.9,
  };

  const colorEstado = (estado: string) => {
    const e = estado.toLowerCase();
    if (e.includes("marcha") || e.includes("operativa")) return "bg-emerald-100 text-emerald-700 border-emerald-200";
    if (e.includes("manual") || e.includes("observaciones") || e.includes("reserva")) return "bg-amber-100 text-amber-700 border-amber-200";
    if (e.includes("falla") || e.includes("parada")) return "bg-red-100 text-red-700 border-red-200";
    return "bg-slate-100 text-slate-700 border-slate-200";
  };

  const colorAlarma = (tipo: string) => {
    if (tipo === "danger") return "border-red-200 bg-red-50 text-red-700";
    if (tipo === "warn") return "border-amber-200 bg-amber-50 text-amber-700";
    return "border-sky-200 bg-sky-50 text-sky-700";
  };

  const Kpi = ({ titulo, valor, subtitulo }: { titulo: string; valor: string; subtitulo?: string }) => (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-xs uppercase tracking-wide text-slate-500">{titulo}</div>
      <div className="mt-2 text-3xl font-semibold text-slate-900">{valor}</div>
      {subtitulo ? <div className="mt-1 text-sm text-slate-500">{subtitulo}</div> : null}
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 p-6 text-slate-900">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Operación y confiabilidad</h1>
              <p className="mt-2 text-sm text-slate-600">
                Vista mockup harcodeada para validar diseño antes de conectar base y backend.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm lg:grid-cols-4">
              <div className="rounded-2xl bg-slate-100 px-4 py-3">Área: <b>Oeste</b></div>
              <div className="rounded-2xl bg-slate-100 px-4 py-3">Turno: <b>Mañana</b></div>
              <div className="rounded-2xl bg-slate-100 px-4 py-3">Modo global: <b>Automático</b></div>
              <div className="rounded-2xl bg-slate-100 px-4 py-3">Última actualización: <b>10:42</b></div>
            </div>
          </div>
        </div>

        <div>
          <h2 className="mb-3 text-xl font-semibold">Resumen general</h2>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Kpi titulo="Disponibilidad" valor={`${resumen.disponibilidad}%`} subtitulo="Bombas del área" />
            <Kpi titulo="Arranques hoy" valor={`${resumen.arranquesHoy}`} subtitulo="Total del día" />
            <Kpi titulo="Horas de marcha" valor={`${resumen.horasMarcha} h`} subtitulo="Acumulado del día" />
            <Kpi titulo="Energía" valor={`${resumen.energiaDia} kWh`} subtitulo="Consumo diario" />
            <Kpi titulo="Eficiencia" valor={`${resumen.eficiencia} kWh/m³`} subtitulo="Consumo específico" />
            <Kpi titulo="Fallas del mes" valor={`${resumen.fallasMes}`} subtitulo="Correctivos abiertos/cerrados" />
            <Kpi titulo="MTBF" valor={`${resumen.mtbf} h`} subtitulo="Tiempo medio entre fallas" />
            <Kpi titulo="MTTR" valor={`${resumen.mttr} h`} subtitulo="Tiempo medio de reparación" />
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.7fr_1fr]">
          <section className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">Operación por planta</h2>
              <div className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm shadow-sm">
                2 plantas monitoreadas
              </div>
            </div>

            {plantas.map((planta) => (
              <div key={planta.id} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-3">
                      <h3 className="text-2xl font-semibold">{planta.nombre}</h3>
                      <span className={`rounded-full border px-3 py-1 text-sm font-medium ${colorEstado(planta.estadoGeneral)}`}>
                        {planta.estadoGeneral}
                      </span>
                      <span className={`rounded-full border px-3 py-1 text-sm font-medium ${colorEstado(planta.modo)}`}>
                        {planta.modo}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-slate-600">
                      Vista operativa diaria con variables principales y desempeño por bomba.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:w-[440px]">
                    <div className="rounded-2xl bg-slate-50 p-3">
                      <div className="text-xs text-slate-500">Nivel</div>
                      <div className="mt-1 text-xl font-semibold">{planta.nivel}%</div>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-3">
                      <div className="text-xs text-slate-500">Presión</div>
                      <div className="mt-1 text-xl font-semibold">{planta.presion} bar</div>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-3">
                      <div className="text-xs text-slate-500">Caudal</div>
                      <div className="mt-1 text-xl font-semibold">{planta.caudal} m³/h</div>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-3">
                      <div className="text-xs text-slate-500">Potencia</div>
                      <div className="mt-1 text-xl font-semibold">{planta.potenciaKw} kW</div>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-3">
                      <div className="text-xs text-slate-500">Energía</div>
                      <div className="mt-1 text-xl font-semibold">{planta.energiaKwh} kWh</div>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-3">
                      <div className="text-xs text-slate-500">kWh/m³</div>
                      <div className="mt-1 text-xl font-semibold">{planta.eficiencia}</div>
                    </div>
                  </div>
                </div>

                <div className="mt-5 overflow-x-auto rounded-2xl border border-slate-200">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-50 text-slate-600">
                      <tr>
                        <th className="px-4 py-3 text-left font-medium">Bomba</th>
                        <th className="px-4 py-3 text-left font-medium">Estado</th>
                        <th className="px-4 py-3 text-right font-medium">Horas</th>
                        <th className="px-4 py-3 text-right font-medium">Arranques</th>
                        <th className="px-4 py-3 text-right font-medium">Disponibilidad</th>
                        <th className="px-4 py-3 text-right font-medium">Fallas</th>
                        <th className="px-4 py-3 text-right font-medium">MTBF</th>
                        <th className="px-4 py-3 text-right font-medium">MTTR</th>
                      </tr>
                    </thead>
                    <tbody>
                      {planta.bombas.map((bomba) => (
                        <tr key={bomba.nombre} className="border-t border-slate-200">
                          <td className="px-4 py-3 font-medium text-slate-900">{bomba.nombre}</td>
                          <td className="px-4 py-3">
                            <span className={`rounded-full border px-3 py-1 text-xs font-medium ${colorEstado(bomba.estado)}`}>
                              {bomba.estado}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">{bomba.horas} h</td>
                          <td className="px-4 py-3 text-right">{bomba.arranques}</td>
                          <td className="px-4 py-3 text-right">{bomba.disponibilidad}%</td>
                          <td className="px-4 py-3 text-right">{bomba.fallas}</td>
                          <td className="px-4 py-3 text-right">{bomba.mtbf} h</td>
                          <td className="px-4 py-3 text-right">{bomba.mttr} h</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </section>

          <aside className="space-y-6">
            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-xl font-semibold">Alarmas y observaciones</h2>
              <div className="mt-4 space-y-3">
                {plantas.flatMap((planta) =>
                  planta.alarmas.map((alarma, idx) => (
                    <div key={`${planta.id}-${idx}`} className={`rounded-2xl border p-4 ${colorAlarma(alarma.tipo)}`}>
                      <div className="text-xs font-semibold uppercase tracking-wide">{planta.nombre}</div>
                      <div className="mt-1 text-sm">{alarma.texto}</div>
                    </div>
                  ))
                )}
              </div>
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-xl font-semibold">Confiabilidad</h2>
              <div className="mt-4 space-y-4">
                <div className="rounded-2xl bg-slate-50 p-4">
                  <div className="text-sm text-slate-500">Equipo más comprometido</div>
                  <div className="mt-1 text-lg font-semibold">Bomba 4</div>
                  <div className="text-sm text-slate-600">2 fallas en el mes · MTBF 140 h · MTTR 4.5 h</div>
                </div>
                <div className="rounded-2xl bg-slate-50 p-4">
                  <div className="text-sm text-slate-500">Mayor tiempo en marcha</div>
                  <div className="mt-1 text-lg font-semibold">Bomba 3</div>
                  <div className="text-sm text-slate-600">15.1 h hoy · 11 arranques</div>
                </div>
                <div className="rounded-2xl bg-slate-50 p-4">
                  <div className="text-sm text-slate-500">Observación recomendada</div>
                  <div className="mt-1 text-sm text-slate-700">
                    Revisar causa de reincidencia térmica en Bomba 4 y validar si hay desbalance operativo en Planta Oeste 2.
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-xl font-semibold">Acciones sugeridas</h2>
              <ul className="mt-4 space-y-3 text-sm text-slate-700">
                <li className="rounded-2xl bg-slate-50 p-4">Verificar lógica de paso manual/automático cuando una bomba se detiene por protección.</li>
                <li className="rounded-2xl bg-slate-50 p-4">Agregar motivo obligatorio cuando el operador pase una bomba a manual.</li>
                <li className="rounded-2xl bg-slate-50 p-4">Relacionar fallas con consumo energético para detectar pérdida de rendimiento.</li>
              </ul>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}
