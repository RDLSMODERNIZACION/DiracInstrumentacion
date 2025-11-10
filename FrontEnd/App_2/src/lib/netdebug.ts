// src/lib/netdebug.ts
let _installed = false;

function isNetDebug(): boolean {
  try {
    const qs = new URLSearchParams(window.location.search);
    return qs.get("debug") === "net" || qs.get("debug") === "1";
  } catch {
    return false;
  }
}

export function netLogGroup(title: string, obj?: any) {
  if (!isNetDebug()) return;
  try {
    console.groupCollapsed(`%c[NET] ${title}`, "color:#0ea5e9;font-weight:600");
    if (obj) console.log(obj);
  } catch {}
}

export function netLog(...args: any[]) {
  if (!isNetDebug()) return;
  try { console.log("%c[NET]", "color:#0ea5e9", ...args); } catch {}
}

export function netWarn(...args: any[]) {
  if (!isNetDebug()) return;
  try { console.warn("%c[NET]", "color:#f59e0b", ...args); } catch {}
}

export function netError(...args: any[]) {
  if (!isNetDebug()) return;
  try { console.error("%c[NET]", "color:#ef4444", ...args); } catch {}
}

export function installNetDebug() {
  if (_installed) return;
  _installed = true;

  if (!isNetDebug()) return; // solo si se activó con ?debug=net/1

  netLog("NetDebug ON", {
    origin: location.origin,
    userAgent: navigator.userAgent,
  });

  // Captura errores globales
  window.addEventListener("error", (e) => {
    netError("window.error", { message: e.message, filename: (e as any).filename, lineno: (e as any).lineno });
  });

  window.addEventListener("unhandledrejection", (e) => {
    netError("unhandledrejection", e.reason);
  });

  // Opción: log de fetch global (no intercepta, solo informa si se quiere más ruido)
  // podés comentar si es demasiado verborrágico
  const origFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const t0 = performance.now();
    const url = typeof input === "string" ? input : (input as URL).toString?.() || String(input);
    if (isNetDebug()) netLogGroup("fetch()", { url, init });
    try {
      const res = await origFetch(input, init);
      const t1 = performance.now();
      if (isNetDebug()) {
        netLog("↳ res", {
          url,
          status: res.status,
          statusText: res.statusText,
          durMs: Math.round(t1 - t0),
        });
        console.groupEnd?.();
      }
      return res;
    } catch (err) {
      const t1 = performance.now();
      netError("↳ FAILED", { url, durMs: Math.round(t1 - t0), err });
      console.groupEnd?.();
      throw err;
    }
  };
}
