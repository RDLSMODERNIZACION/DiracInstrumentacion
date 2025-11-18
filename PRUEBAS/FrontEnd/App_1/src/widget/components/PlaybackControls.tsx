import React from "react";

export default function PlaybackControls({
  disabled,
  playEnabled,
  setPlayEnabled,
  playing,
  setPlaying,
  playFinMin,
  setPlayFinMin,
  MIN_OFFSET_MIN,
  MAX_OFFSET_MIN,
  setDragging,
  startLabel,
  endLabel,
}: {
  disabled?: boolean;
  playEnabled: boolean;
  setPlayEnabled: (v: boolean) => void;
  playing: boolean;
  setPlaying: (v: boolean) => void;
  playFinMin: number;
  setPlayFinMin: (v: number) => void;
  MIN_OFFSET_MIN: number;
  MAX_OFFSET_MIN: number;
  setDragging: (v: boolean) => void;
  startLabel: string;
  endLabel: string;
}) {
  return (
    <div className="flex-1 min-w-[320px]">
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            disabled={disabled}
            checked={playEnabled}
            onChange={(e) => {
              setPlayEnabled(e.target.checked);
              setPlaying(false);
            }}
          />
          <span className={`text-sm ${disabled ? "text-gray-400" : "text-gray-700"}`}>
            Playback 24 h (7 días → ahora)
          </span>
        </label>

        <button
          className="px-2 py-1 border rounded-lg text-sm"
          disabled={!playEnabled}
          onClick={() => setPlaying(!playing)}
          title={playing ? "Pausar" : "Reproducir"}
        >
          {playing ? "⏸" : "▶"}
        </button>
      </div>

      <div className="mt-2 flex items-center gap-3">
        <input
          type="range"
          min={MIN_OFFSET_MIN}
          max={MAX_OFFSET_MIN}
          step={1}
          disabled={!playEnabled}
          value={playFinMin}
          onChange={(e) => setPlayFinMin(Number(e.target.value))}
          onMouseDown={() => setDragging(true)}
          onMouseUp={() => setDragging(false)}
          onTouchStart={() => setDragging(true)}
          onTouchEnd={() => setDragging(false)}
          className="w-full"
          title="Fin de la ventana (minutos desde el inicio base de 7 días)"
        />
      </div>

      <div className="mt-1 flex items-center justify-between text-xs">
        <span className="text-gray-500">
          Inicio: <b>{startLabel}</b>
        </span>
        <span className="text-gray-500">
          Fin: <b>{endLabel}</b>
        </span>
      </div>
    </div>
  );
}
