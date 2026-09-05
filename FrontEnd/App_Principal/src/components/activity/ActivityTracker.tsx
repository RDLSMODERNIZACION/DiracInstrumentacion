import React from "react";
import { useAuthedFetch } from "../../lib/auth";

const SESSION_KEY = "dirac.activity_session_id";

function clientInfo() {
  const ua = navigator.userAgent || "";
  const lower = ua.toLowerCase();

  const device_type = /ipad|tablet/.test(lower)
    ? "tablet"
    : /mobi|android|iphone|ipod/.test(lower)
    ? "mobile"
    : "desktop";

  let browser = "Otro";
  if (/edg\//i.test(ua)) browser = "Edge";
  else if (/opr\//i.test(ua)) browser = "Opera";
  else if (/chrome\//i.test(ua)) browser = "Chrome";
  else if (/firefox\//i.test(ua)) browser = "Firefox";
  else if (/safari\//i.test(ua)) browser = "Safari";

  let os = "Otro";
  if (/windows/i.test(ua)) os = "Windows";
  else if (/android/i.test(ua)) os = "Android";
  else if (/iphone|ipad|ipod/i.test(ua)) os = "iOS";
  else if (/mac os x|macintosh/i.test(ua)) os = "macOS";
  else if (/linux/i.test(ua)) os = "Linux";

  return { device_type, browser, os, user_agent: ua };
}

export default function ActivityTracker({ section }: { section: string }) {
  const api = useAuthedFetch();
  const sessionRef = React.useRef<number | null>(null);

  const ensureSession = React.useCallback(async () => {
    if (sessionRef.current) return sessionRef.current;

    const stored = sessionStorage.getItem(SESSION_KEY);
    if (stored && Number.isFinite(Number(stored))) {
      sessionRef.current = Number(stored);
      return sessionRef.current;
    }

    const res = await api("/dirac/activity/session/start", {
      method: "POST",
      body: JSON.stringify({
        ...clientInfo(),
        current_section: section,
        current_path: window.location.pathname,
      }),
    });

    if (!res.ok) return null;
    const row = await res.json();
    const id = Number(row?.id);
    if (!Number.isFinite(id)) return null;

    sessionRef.current = id;
    sessionStorage.setItem(SESSION_KEY, String(id));
    return id;
  }, [api, section]);

  const ping = React.useCallback(async () => {
    try {
      const sessionId = await ensureSession();
      if (!sessionId) return;
      const res = await api("/dirac/activity/session/heartbeat", {
        method: "POST",
        body: JSON.stringify({
          session_id: sessionId,
          current_section: section,
          current_path: window.location.pathname,
        }),
      });
      if (res.status === 404) {
        sessionStorage.removeItem(SESSION_KEY);
        sessionRef.current = null;
      }
    } catch {
      // Auditoría no debe interrumpir la operación del SCADA.
    }
  }, [api, ensureSession, section]);

  React.useEffect(() => {
    ping();
  }, [ping]);

  React.useEffect(() => {
    const id = window.setInterval(ping, 60_000);
    return () => window.clearInterval(id);
  }, [ping]);

  return null;
}

export { SESSION_KEY };
