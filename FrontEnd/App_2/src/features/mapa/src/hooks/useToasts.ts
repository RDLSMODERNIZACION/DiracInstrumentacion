import { useRef, useState } from "react";

export type Toast = { id: string; title: string; sub: string };

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastTimer = useRef<number | null>(null);

  const pushToast = (title: string, sub: string) => {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setToasts((ts) => [{ id, title, sub }, ...ts].slice(0, 3));
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToasts([]), 4200);
  };

  const clearToasts = () => setToasts([]);

  return { toasts, pushToast, clearToasts };
}
