export default function OperacionConfiabilidadMockup() {
  const eventosCriticos = [
    {
      id: 1,
      tipo: "Tanque en mínimo",
      equipo: "Tanque Cisterna Oeste",
      ubicacion: "Planta Oeste 2",
      fechaHora: "24/04/2026 09:42",
      minimoConfigurado: "30%",
      valorDetectado: "27%",
      duracion: "34 min",
      estado: "Activo",
    },
    {
      id: 2,
      tipo: "Tanque en mínimo",
      equipo: "Tanque Planta Oeste 1",
      ubicacion: "Planta Oeste 1",
      fechaHora: "23/04/2026 18:10",
      minimoConfigurado: "25%",
      valorDetectado: "22%",
      duracion: "18 min",
      estado: "Normalizado",
    },
    {
      id: 3,
      tipo: "Tanque en mínimo",
      equipo: "Tanque Reserva",
      ubicacion: "Sector Norte",
      fechaHora: "21/04/2026 04:25",
      minimoConfigurado: "20%",
      valorDetectado: "18%",
      duracion: "52 min",
      estado: "Normalizado",
    },
  ];

  const bombas = [
    {
      id: 1,
      nombre: "Bomba 1",
      ubicacion: "Planta Oeste 1",
      estado: "Encendida",
      encendidos: 84,
      apagados: 83,
      tiempoEncendida: "126 h",
      tiempoFrenada: "42 h",
      ultimaActividad: "Encendió hace 18 min",
      disponibilidad: "98.2%",
    },
    {
      id: 2,
      nombre: "Bomba 2",
      ubicacion: "Planta Oeste 1",
      estado: "Apagada",
      encendidos: 63,
      apagados: 64,
      tiempoEncendida: "91 h",
      tiempoFrenada: "77 h",
      ultimaActividad: "Paró hace 1 h 10 min",
      disponibilidad: "96.4%",
    },
    {
      id: 3,
      nombre: "Bomba 3",
      ubicacion: "Planta Oeste 2",
      estado: "Encendida",
      encendidos: 112,
      apagados: 111,
      tiempoEncendida: "148 h",
      tiempoFrenada: "20 h",
      ultimaActividad: "Encendió hace 42 min",
      disponibilidad: "94.8%",
    },
    {
      id: 4,
      nombre: "Bomba 4",
      ubicacion: "Planta Oeste 2",
      estado: "Apagada",
      encendidos: 96,
      apagados: 97,
      tiempoEncendida: "104 h",
      tiempoFrenada: "64 h",
      ultimaActividad: "Paró hace 2 h 35 min",
      disponibilidad: "91.3%",
    },
  ];

  const badgeEstado = (estado: string) => {
    if (estado === "Encendida" || estado === "Normalizado") {
      return "bg-emerald-100 text-emerald-700 border-emerald-200";
    }

    if (estado === "Activo") {
      return "bg-red-100 text-red-700 border-red-200";
    }

    if (estado === "Apagada") {
      return "bg-slate-100 text-slate-700 border-slate-200";
    }

    return "bg-amber-100 text-amber-700 border-amber-200";
  };

  const Kpi = ({
    titulo,
    valor,
    ayuda,
  }: {
    titulo: string;
    valor: string | number;
    ayuda?: string;
  }) => (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="text-sm font-medium text-slate-500">{titulo}</div>
      <div className="mt-2 text-4xl font-bold text-slate-900">{valor}</div>
      {ayuda ? <div className="mt-1 text-sm text-slate-500">{ayuda}</div> : null}
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 p-6 text-slate-900">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-3xl font-bold tracking-tight">
            Operación y confiabilidad
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Eventos críticos de tanques y detalle operativo de bombas.
          </p>
        </header>

        <section className="grid gap-4 md:grid-cols-4">
          <Kpi titulo="Eventos críticos" valor={eventosCriticos.length} ayuda="Historial registrado" />
          <Kpi titulo="Eventos activos" valor={1} ayuda="Requieren atención" />
          <Kpi titulo="Bombas encendidas" valor={2} ayuda="Estado actual" />
          <Kpi titulo="Bombas apagadas" valor={2} ayuda="Estado actual" />
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-2xl font-semibold">Historial de eventos críticos</h2>
              <p className="mt-1 text-sm text-slate-600">
                Tanques que tocaron el mínimo configurado.
              </p>
            </div>

            <div className="rounded-2xl bg-slate-100 px-4 py-2 text-sm text-slate-700">
              Ordenado por más reciente
            </div>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Evento</th>
                  <th className="px-4 py-3 text-left font-medium">Equipo</th>
                  <th className="px-4 py-3 text-left font-medium">Ubicación</th>
                  <th className="px-4 py-3 text-right font-medium">Fecha y hora</th>
                  <th className="px-4 py-3 text-right font-medium">Mínimo config.</th>
                  <th className="px-4 py-3 text-right font-medium">Valor detectado</th>
                  <th className="px-4 py-3 text-right font-medium">Duración</th>
                  <th className="px-4 py-3 text-right font-medium">Estado</th>
                </tr>
              </thead>

              <tbody>
                {eventosCriticos.map((evento) => (
                  <tr key={evento.id} className="border-t border-slate-200">
                    <td className="px-4 py-4 font-medium">{evento.tipo}</td>
                    <td className="px-4 py-4">{evento.equipo}</td>
                    <td className="px-4 py-4">{evento.ubicacion}</td>
                    <td className="px-4 py-4 text-right">{evento.fechaHora}</td>
                    <td className="px-4 py-4 text-right">{evento.minimoConfigurado}</td>
                    <td className="px-4 py-4 text-right font-semibold">{evento.valorDetectado}</td>
                    <td className="px-4 py-4 text-right">{evento.duracion}</td>
                    <td className="px-4 py-4 text-right">
                      <span className={`rounded-full border px-3 py-1 text-xs font-medium ${badgeEstado(evento.estado)}`}>
                        {evento.estado}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4">
            <h2 className="text-2xl font-semibold">Detalle de bombas</h2>
            <p className="mt-1 text-sm text-slate-600">
              Resumen acumulado por bomba: encendidos, apagados y tiempos.
            </p>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Bomba</th>
                  <th className="px-4 py-3 text-left font-medium">Ubicación</th>
                  <th className="px-4 py-3 text-left font-medium">Estado</th>
                  <th className="px-4 py-3 text-right font-medium">Encendidos</th>
                  <th className="px-4 py-3 text-right font-medium">Apagados</th>
                  <th className="px-4 py-3 text-right font-medium">Tiempo encendida</th>
                  <th className="px-4 py-3 text-right font-medium">Tiempo frenada</th>
                  <th className="px-4 py-3 text-right font-medium">Disponibilidad</th>
                  <th className="px-4 py-3 text-right font-medium">Última actividad</th>
                </tr>
              </thead>

              <tbody>
                {bombas.map((bomba) => (
                  <tr key={bomba.id} className="border-t border-slate-200">
                    <td className="px-4 py-4 font-medium text-slate-900">{bomba.nombre}</td>
                    <td className="px-4 py-4">{bomba.ubicacion}</td>
                    <td className="px-4 py-4">
                      <span className={`rounded-full border px-3 py-1 text-xs font-medium ${badgeEstado(bomba.estado)}`}>
                        {bomba.estado}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-right">{bomba.encendidos}</td>
                    <td className="px-4 py-4 text-right">{bomba.apagados}</td>
                    <td className="px-4 py-4 text-right">{bomba.tiempoEncendida}</td>
                    <td className="px-4 py-4 text-right">{bomba.tiempoFrenada}</td>
                    <td className="px-4 py-4 text-right font-semibold">{bomba.disponibilidad}</td>
                    <td className="px-4 py-4 text-right text-slate-600">{bomba.ultimaActividad}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}