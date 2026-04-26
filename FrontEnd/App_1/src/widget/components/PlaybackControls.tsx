import React from "react";

export default function PlaybackControls({
  disabled,
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
  startLabel,
  endLabel,
  loadingPlay,
}: {
  disabled?: boolean;

  playEnabled: boolean;
  setPlayEnabled: (v: boolean) => void;

  playDate: string;
  setPlayDate: (v: string) => void;

  minDate: string;
  maxDate: string;

  prevDay: () => void;
  nextDay: () => void;
  goToday: () => void;

  selectedDayLabel: string;

  startLabel: string;
  endLabel: string;

  loadingPlay?: boolean;
}) {
  const canPrev = playDate > minDate;
  const canNext = playDate < maxDate;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
          <input
            type="checkbox"
            disabled={disabled}
            checked={playEnabled}
            onChange={(e) => setPlayEnabled(e.target.checked)}
          />
          Playback por día
        </label>

        {playEnabled && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={!canPrev}
              onClick={prevDay}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Día anterior
            </button>

            <input
              type="date"
              value={playDate}
              min={minDate}
              max={maxDate}
              onChange={(e) => setPlayDate(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-400"
            />

            <button
              type="button"
              disabled={!canNext}
              onClick={nextDay}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Día siguiente
            </button>

            <button
              type="button"
              onClick={goToday}
              className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100"
            >
              Hoy
            </button>
          </div>
        )}
      </div>

      {playEnabled && (
        <div className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>
              Día seleccionado:{" "}
              <span className="font-semibold text-slate-800">
                {selectedDayLabel}
              </span>
            </span>

            {loadingPlay && (
              <span className="font-semibold text-blue-700">
                Cargando datos...
              </span>
            )}
          </div>

          <div className="mt-1 text-slate-500">
            Ventana: <span className="font-medium">{startLabel}</span> →{" "}
            <span className="font-medium">{endLabel}</span>
          </div>
        </div>
      )}

      {!playEnabled && (
        <div className="mt-2 text-xs text-slate-400">
          En vivo: se muestran las últimas 24 h.
        </div>
      )}
    </div>
  );
}