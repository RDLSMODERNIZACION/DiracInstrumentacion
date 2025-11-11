// src/components/DebugConsole.tsx
import React from 'react';
import { onLog, LogEvent, LogLevel, isDebugEnabled } from '../debug/LogBus';

type Props = { autoOpen?: boolean };

const levels: LogLevel[] = ['error','warn','info','log','debug','fetch'];
const levelColors: Record<LogLevel, string> = {
  error: '#b91c1c', warn: '#b45309', info: '#0369a1', log: '#334155', debug: '#64748b', fetch: '#0f766e'
};

export default function DebugConsole({ autoOpen }: Props) {
  const [open, setOpen] = React.useState(Boolean(autoOpen ?? isDebugEnabled()));
  const [paused, setPaused] = React.useState(false);
  const [enabled, setEnabled] = React.useState<Record<LogLevel, boolean>>({
    error: true, warn: true, info: true, log: true, debug: true, fetch: true
  });
  const [events, setEvents] = React.useState<LogEvent[]>([]);
  const bottomRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    return onLog((ev) => {
      if (paused) return;
      setEvents(prev => {
        const next = [...prev, ev];
        return next.length > 500 ? next.slice(next.length - 500) : next;
      });
    });
  }, [paused]);

  React.useEffect(() => {
    if (!open) return;
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [events, open]);

  const toggle = (lvl: LogLevel) => setEnabled(e => ({ ...e, [lvl]: !e[lvl] }));
  const visible = events.filter(e => enabled[e.level]);

  return (
    <>
      {/* FAB toggle */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          position: 'fixed', right: 12, bottom: 12, zIndex: 999999,
          background: '#111827', color: 'white', borderRadius: 999, padding: '8px 12px',
          boxShadow: '0 6px 18px rgba(0,0,0,.25)', border: '1px solid rgba(255,255,255,.12)'
        }}
        title="Abrir/cerrar logs"
      >
        🐞 Logs
      </button>

      {!open ? null : (
        <div
          style={{
            position: 'fixed', left: 0, right: 0, bottom: 0, height: '38vh',
            background: 'rgba(17,24,39,.98)', color: '#e5e7eb',
            borderTop: '1px solid rgba(255,255,255,.15)', zIndex: 999998,
            display: 'flex', flexDirection: 'column'
          }}
        >
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', padding: '6px 10px', gap: 8 }}>
            <strong style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>LOGS</strong>
            <span style={{ opacity: .6, fontSize: 12 }}>({visible.length}/{events.length})</span>
            <div style={{ flex: 1 }} />
            <button onClick={() => setPaused(p => !p)} style={btnStyle}>{paused ? '▶ Reanudar' : '⏸️ Pausar'}</button>
            <button onClick={() => setEvents([])} style={btnStyle}>🧹 Limpiar</button>
            <button onClick={() => setOpen(false)} style={btnStyle}>✖</button>
          </div>

          {/* Filtros */}
          <div style={{ display: 'flex', gap: 8, padding: '0 10px 6px 10px', flexWrap: 'wrap' }}>
            {levels.map(lvl => (
              <label key={lvl} style={{
                display: 'inline-flex', alignItems: 'center',
                gap: 6, fontSize: 12, padding: '4px 8px',
                borderRadius: 6, cursor: 'pointer',
                background: enabled[lvl] ? 'rgba(255,255,255,.12)' : 'rgba(255,255,255,.05)',
                border: `1px solid rgba(255,255,255,${enabled[lvl] ? .25 : .12})`
              }}>
                <input
                  type="checkbox"
                  checked={enabled[lvl]}
                  onChange={() => toggle(lvl)}
                  style={{ accentColor: levelColors[lvl] }}
                />
                <span style={{ color: levelColors[lvl] }}>{lvl.toUpperCase()}</span>
              </label>
            ))}
          </div>

          {/* Listado */}
          <div
            style={{
              flex: 1, overflow: 'auto',
              padding: '4px 10px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              fontSize: 12, lineHeight: 1.35
            }}
          >
            {visible.map(ev => (
              <div key={ev.id} style={{ whiteSpace: 'pre-wrap' }}>
                <span style={{ color: '#9CA3AF' }}>
                  {new Date(ev.ts).toLocaleTimeString()} │
                </span>{' '}
                <span style={{ color: levelColors[ev.level] }}>{ev.level.toUpperCase()}</span>{' '}
                <span>{ev.text}</span>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        </div>
      )}
    </>
  );
}

const btnStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,.08)',
  color: '#e5e7eb',
  padding: '4px 8px',
  border: '1px solid rgba(255,255,255,.18)',
  borderRadius: 6,
  cursor: 'pointer'
};
