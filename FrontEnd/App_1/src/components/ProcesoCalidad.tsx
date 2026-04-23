export default function ProcesoCalidad() {
  const proceso = {
    planta: "Planta Oeste",
    turno: "Mañana",
    ultimaActualizacion: "10:48",
    estadoGeneral: "Operación estable con dosificación activa",
    caudalEntrada: 235,
    caudalSalida: 228,
    turbidezEntrada: 18.4,
    turbidezSalida: 1.2,
    phActual: 7.08,
    cloroResidual: 0.82,
    cloroDosificado: 3.4,
    sulfatoDosificado: 28,
    consumoSulfatoDia: 312,
    consumoCloroDia: 42,
  };

  const lineas = [
    {
      nombre: "Coagulación / Floculación",
      estado: "Activa",
      setpoint: "Sulfato 28 mg/L",
      actual: "27.6 mg/L",
      observacion: "Consumo estable según turbidez de entrada",
    },
    {
      nombre: "Corrección de pH",
      estado: "Controlado",
      setpoint: "pH 6.8 - 7.2",
      actual: "7.08",
      observacion: "Dentro de banda objetivo",
    },
    {
      nombre: "Desinfección",
      estado: "Activa",
      setpoint: "Cloro residual 0.6 - 1.0 mg/L",
      actual: "0.82 mg/L",
      observacion: "Respuesta estable de la dosificación",
    },
  ];

  const calidad = [
    { parametro: "pH", objetivo: "6.8 - 7.2", valor: "7.08", estado: "OK" },
    { parametro: "Cloro residual", objetivo: "0.6 - 1.0 mg/L", valor: "0.82 mg/L", estado: "OK" },
    { parametro: "Turbidez salida", objetivo: "< 2 NTU", valor: "1.2 NTU", estado: "OK" },
    { parametro: "Turbidez entrada", objetivo: "Referencia de proceso", valor: "18.4 NTU", estado: "Observación" },
    { parametro: "Dosis sulfato", objetivo: "Según turbidez / jar test", valor: "28 mg/L", estado: "OK" },
    { parametro: "Dosis cloro", objetivo: "Ajuste por residual", valor: "3.4 mg/L", estado: "OK" },
  ];

  const alarmas = [
    {
      tipo: "warn",
      titulo: "Verificar tendencia de turbidez de entrada",
      detalle:
        "La turbidez de entrada subió respecto al turno anterior. Confirmar si la dosis de sulfato sigue acompañando correctamente.",
    },
    {
      tipo: "info",
      titulo: "Residual de cloro dentro de banda",
      detalle:
        "No requiere corrección inmediata. Seguir controlando el valor en salida de planta y red cercana.",
    },
  ];

  const acciones = [
    "Registrar dosis diaria de sulfato de aluminio y comparar contra la turbidez de entrada.",
    "Registrar consumo diario de cloro y contrastarlo con el cloro residual medido en salida.",
    "Agregar tendencia histórica de pH, cloro residual, turbidez y consumo químico.",
    "Permitir marcar si la dosis fue ajustada por operador o por lógica automática.",
  ];

  const badge = (estado: string) => {
    const e = estado.toLowerCase();
    if (
      e.includes("ok") ||
      e.includes("estable") ||
      e.includes("activa") ||
      e.includes("controlado")
    ) {
      return "bg-emerald-100 text-emerald-700 border-emerald-200";
    }
    if (e.includes("observación") || e.includes("warn")) {
      return "bg-amber-100 text-amber-700 border-amber-200";
    }
    return "bg-slate-100 text-slate-700 border-slate-200";
  };

  const alertBox = (tipo: string) => {
    if (tipo === "warn") return "border-amber-200 bg-amber-50 text-amber-800";
    if (tipo === "danger") return "border-red-200 bg-red-50 text-red-800";
    return "border-sky-200 bg-sky-50 text-sky-800";
  };

  const Kpi = ({
    titulo,
    valor,
    subtitulo,
  }: {
    titulo: string;
    valor: string;
    subtitulo?: string;
  }) => (
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
              <h1 className="text-3xl font-bold tracking-tight">Proceso y calidad de agua</h1>
              <p className="mt-2 text-sm text-slate-600">
                Mockup harcodeado para validar cómo mostrar dosificación de sulfato de
                aluminio, cloro, pH y cloro residual.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 text-sm lg:grid-cols-4">
              <div className="rounded-2xl bg-slate-100 px-4 py-3">
                Planta: <b>{proceso.planta}</b>
              </div>
              <div className="rounded-2xl bg-slate-100 px-4 py-3">
                Turno: <b>{proceso.turno}</b>
              </div>
              <div className="rounded-2xl bg-slate-100 px-4 py-3">
                Estado: <b>Con dosificación</b>
              </div>
              <div className="rounded-2xl bg-slate-100 px-4 py-3">
                Actualizado: <b>{proceso.ultimaActualizacion}</b>
              </div>
            </div>
          </div>
        </div>

        <div>
          <h2 className="mb-3 text-xl font-semibold">Resumen del proceso</h2>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Kpi
              titulo="Caudal de entrada"
              valor={`${proceso.caudalEntrada} m³/h`}
              subtitulo="Agua cruda"
            />
            <Kpi
              titulo="Caudal de salida"
              valor={`${proceso.caudalSalida} m³/h`}
              subtitulo="Agua tratada"
            />
            <Kpi
              titulo="Turbidez entrada"
              valor={`${proceso.turbidezEntrada} NTU`}
              subtitulo="Referencia para coagulación"
            />
            <Kpi
              titulo="Turbidez salida"
              valor={`${proceso.turbidezSalida} NTU`}
              subtitulo="Calidad final"
            />
            <Kpi
              titulo="pH actual"
              valor={`${proceso.phActual}`}
              subtitulo="Medición en salida"
            />
            <Kpi
              titulo="Cloro residual"
              valor={`${proceso.cloroResidual} mg/L`}
              subtitulo="Medición en salida"
            />
            <Kpi
              titulo="Dosis de cloro"
              valor={`${proceso.cloroDosificado} mg/L`}
              subtitulo="Dosificación aplicada"
            />
            <Kpi
              titulo="Dosis de sulfato"
              valor={`${proceso.sulfatoDosificado} mg/L`}
              subtitulo="Coagulante aplicado"
            />
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.7fr_1fr]">
          <section className="space-y-6">
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h2 className="text-xl font-semibold">Etapas del proceso</h2>
                  <p className="mt-1 text-sm text-slate-600">
                    Visual simple para validar qué mostrar en coagulación, corrección de pH
                    y desinfección.
                  </p>
                </div>

                <span
                  className={`rounded-full border px-3 py-1 text-sm font-medium ${badge(
                    proceso.estadoGeneral
                  )}`}
                >
                  {proceso.estadoGeneral}
                </span>
              </div>

              <div className="mt-5 grid gap-4">
                {lineas.map((etapa) => (
                  <div
                    key={etapa.nombre}
                    className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                  >
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <div className="flex items-center gap-3">
                          <h3 className="text-lg font-semibold">{etapa.nombre}</h3>
                          <span
                            className={`rounded-full border px-3 py-1 text-xs font-medium ${badge(
                              etapa.estado
                            )}`}
                          >
                            {etapa.estado}
                          </span>
                        </div>
                        <p className="mt-2 text-sm text-slate-600">{etapa.observacion}</p>
                      </div>

                      <div className="grid min-w-[280px] grid-cols-2 gap-3 text-sm">
                        <div className="rounded-2xl bg-white p-3">
                          <div className="text-xs text-slate-500">Setpoint / objetivo</div>
                          <div className="mt-1 font-semibold text-slate-900">
                            {etapa.setpoint}
                          </div>
                        </div>
                        <div className="rounded-2xl bg-white p-3">
                          <div className="text-xs text-slate-500">Valor actual</div>
                          <div className="mt-1 font-semibold text-slate-900">
                            {etapa.actual}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold">Consumo químico del día</h2>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-600">
                  Mockup diario
                </span>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                  <div className="text-sm text-slate-500">Sulfato de aluminio consumido</div>
                  <div className="mt-2 text-4xl font-semibold text-slate-900">
                    {proceso.consumoSulfatoDia} kg
                  </div>
                  <div className="mt-2 text-sm text-slate-600">
                    Relacionado con turbidez de entrada y ajuste de coagulación.
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                  <div className="text-sm text-slate-500">Cloro consumido</div>
                  <div className="mt-2 text-4xl font-semibold text-slate-900">
                    {proceso.consumoCloroDia} kg
                  </div>
                  <div className="mt-2 text-sm text-slate-600">
                    A contrastar con el cloro residual medido en salida de planta.
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-xl font-semibold">Calidad de agua</h2>

              <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium">Parámetro</th>
                      <th className="px-4 py-3 text-left font-medium">Objetivo</th>
                      <th className="px-4 py-3 text-left font-medium">Valor actual</th>
                      <th className="px-4 py-3 text-left font-medium">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {calidad.map((fila) => (
                      <tr key={fila.parametro} className="border-t border-slate-200">
                        <td className="px-4 py-3 font-medium text-slate-900">
                          {fila.parametro}
                        </td>
                        <td className="px-4 py-3">{fila.objetivo}</td>
                        <td className="px-4 py-3">{fila.valor}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`rounded-full border px-3 py-1 text-xs font-medium ${badge(
                              fila.estado
                            )}`}
                          >
                            {fila.estado}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <aside className="space-y-6">
            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-xl font-semibold">Alertas y observaciones</h2>
              <div className="mt-4 space-y-3">
                {alarmas.map((a) => (
                  <div
                    key={a.titulo}
                    className={`rounded-2xl border p-4 ${alertBox(a.tipo)}`}
                  >
                    <div className="text-sm font-semibold">{a.titulo}</div>
                    <div className="mt-1 text-sm">{a.detalle}</div>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-xl font-semibold">Variables clave para registrar</h2>
              <div className="mt-4 space-y-3 text-sm text-slate-700">
                <div className="rounded-2xl bg-slate-50 p-4">Turbidez de entrada</div>
                <div className="rounded-2xl bg-slate-50 p-4">
                  Dosis de sulfato de aluminio
                </div>
                <div className="rounded-2xl bg-slate-50 p-4">pH de salida</div>
                <div className="rounded-2xl bg-slate-50 p-4">Dosis de cloro aplicada</div>
                <div className="rounded-2xl bg-slate-50 p-4">
                  Cloro residual en salida
                </div>
              </div>
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-xl font-semibold">Acciones sugeridas</h2>
              <ul className="mt-4 space-y-3 text-sm text-slate-700">
                {acciones.map((accion) => (
                  <li key={accion} className="rounded-2xl bg-slate-50 p-4">
                    {accion}
                  </li>
                ))}
              </ul>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}