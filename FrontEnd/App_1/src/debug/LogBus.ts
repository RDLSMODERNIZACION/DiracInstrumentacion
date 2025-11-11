// src/debug/LogBus.ts
export type LogLevel = 'log' | 'info' | 'warn' | 'error' | 'debug' | 'fetch';
export type LogEvent = { id: number; ts: number; level: LogLevel; text: string; data?: any };

type Listener = (ev: LogEvent) => void;
const listeners = new Set<Listener>();
let seq = 0;

export function onLog(fn: Listener) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function emit(ev: LogEvent) {
  for (const fn of Array.from(listeners)) fn(ev);
}
export function push(level: LogLevel, ...args: any[]) {
  emit({ id: ++seq, ts: Date.now(), level, text: fmt(args), data: args });
}

export function isDebugEnabled(): boolean {
  try {
    const qs = new URLSearchParams(location.search);
    return Boolean(
      (import.meta as any)?.env?.DEV ||
      (import.meta as any)?.env?.VITE_DEBUG_SCOPE === '1' ||
      localStorage.getItem('DEBUG_SCOPE') === '1' ||
      qs.get('debug') === '1'
    );
  } catch { return false; }
}

export function setupDebugInterceptors() {
  if (!isDebugEnabled()) return;
  installConsoleIntercept();
  installFetchIntercept();
  push('info', '[debug] UI logger ON');
}

function installConsoleIntercept() {
  // evita instalar dos veces
  if ((window as any).__consoleIntercept) return;
  (window as any).__consoleIntercept = true;

  const orig = {
    log: console.log.bind(console),
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
    debug: console.debug.bind(console)
  };

  (['log','info','warn','error','debug'] as LogLevel[]).forEach((level) => {
    (console as any)[level] = (...args: any[]) => {
      try { (orig as any)[level](...args); } catch {}
      try { push(level, ...args); } catch {}
    };
  });

  push('debug', '[debug] console intercept ENABLED');
}

function installFetchIntercept() {
  if ((window as any).__fetchIntercept) return;
  (window as any).__fetchIntercept = true;

  const origFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : (input as Request).url;
    const method = (init?.method ?? 'GET').toUpperCase();
    const t0 = performance.now();
    try {
      const res = await origFetch(input, init);
      const ms = (performance.now() - t0).toFixed(1);
      push('fetch', `[${res.status}] ${method} ${short(url)} (${ms} ms)`, {
        url, method, status: res.status, headers: sanitizeHeaders(init?.headers)
      });
      (window as any).__lastApi = { url, method, status: res.status, ms };
      return res;
    } catch (err: any) {
      const ms = (performance.now() - t0).toFixed(1);
      push('error', `[fetch error] ${method} ${short(url)} (${ms} ms) ${err?.message || String(err)}`, { url, method });
      throw err;
    }
  };

  push('debug', '[debug] fetch intercept ENABLED');
}

function sanitizeHeaders(h?: HeadersInit): Record<string, string> | undefined {
  if (!h) return;
  const out: Record<string, string> = {};
  if (h instanceof Headers) {
    h.forEach((v, k) => (out[k] = mask(k, v)));
    return out;
  }
  if (Array.isArray(h)) {
    for (const [k, v] of h) out[k] = mask(k, String(v));
    return out;
  }
  const obj = h as Record<string, any>;
  for (const k of Object.keys(obj)) out[k] = mask(k, String(obj[k]));
  return out;
}
function mask(k: string, v: string) {
  return k.toLowerCase().includes('authorization') ? '***' : v;
}

function fmt(args: any[]): string {
  return args.map(a => {
    if (typeof a === 'string') return a;
    try { return JSON.stringify(a); } catch { return String(a); }
  }).join(' ');
}
function short(u: string, max = 160) {
  return u.length > max ? u.slice(0, max - 3) + '...' : u;
}
