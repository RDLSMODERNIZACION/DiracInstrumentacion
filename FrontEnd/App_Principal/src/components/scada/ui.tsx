import React, { useEffect, useRef } from "react";
import type { Role } from "./types";

/* =========================
 * Drawer: panel lateral
 * - Props: title, right, width
 * - Accesible (role="dialog", Esc cierra, foco inicial)
 * - Overlay clickeable para cerrar
 * - Bloquea el scroll del fondo mientras está abierto
 * - Layout en flex
 * ========================= */
export type DrawerProps = {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title?: React.ReactNode;          // Texto/nodo para el título (default "Faceplate")
  right?: React.ReactNode;          // Slot opcional (ej: <Badge>Normal</Badge>)
  width?: number | string;          // Ancho del panel (ej: 480 o "560px"). Por defecto 480, responsivo a 100% en mobile.
};

export function Drawer({ open, onClose, children, title = "Faceplate", right, width }: DrawerProps) {
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const titleId = "drawer-title";

  useEffect(() => {
    if (!open) return;

    // Bloquear scroll del body al abrir
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Foco inicial en Cerrar
    closeBtnRef.current?.focus();

    // Cerrar con ESC
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  // Ancho responsivo: 100% en mobile, y hasta "width" en pantallas grandes
  const panelWidth =
    typeof width === "number" ? `min(100%, ${width}px)` : width || "min(100%, 480px)";

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />

      {/* Panel */}
      <div
        className={
          "absolute right-0 top-0 h-full bg-white shadow-2xl flex flex-col " +
          "transition-transform duration-300 translate-x-0 will-change-transform"
        }
        style={{ width: panelWidth }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-3 border-b border-slate-200 flex-none">
          <div className="min-w-0">
            <div id={titleId} className="font-semibold truncate">{title}</div>
          </div>
          <div className="flex items-center gap-2">
            {right}
            <button
              ref={closeBtnRef}
              onClick={onClose}
              className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200"
            >
              Cerrar
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto">{children}</div>
      </div>
    </div>
  );
}

/* =========================
 * NavItem
 * ========================= */
export function NavItem({
  label,
  active,
  onClick,
}: {
  label: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-2 rounded-xl text-sm ${
        active ? "bg-slate-900 text-white" : "hover:bg-slate-100"
      }`}
    >
      {label}
    </button>
  );
}

/* =========================
 * SummaryCard
 * ========================= */
export function SummaryCard({
  title,
  value,
}: {
  title: React.ReactNode;
  value: React.ReactNode;
}) {
  return (
    <div className="p-4 bg-white border border-slate-200 rounded-2xl">
      <div className="text-sm text-slate-500">{title}</div>
      <div className="text-2xl font-semibold">{value}</div>
    </div>
  );
}

/* =========================
 * Badge
 * ========================= */
export function Badge({
  tone = "ok",
  children,
}: {
  tone?: "ok" | "warn" | "bad";
  children: React.ReactNode;
}) {
  const toneMap: Record<string, string> = {
    ok: "bg-emerald-100 text-emerald-700",
    warn: "bg-amber-100 text-amber-700",
    bad: "bg-red-100 text-red-700",
  };
  return (
    <span className={`px-2 py-0.5 rounded-lg text-xs font-medium ${toneMap[tone]}`}>
      {children}
    </span>
  );
}

/* =========================
 * KpiPill
 * ========================= */
export function KpiPill({
  label,
  value,
  tone = "ok",
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  tone?: "ok" | "warn" | "bad";
}) {
  const toneRing: Record<string, string> = {
    ok: "ring-emerald-300",
    warn: "ring-amber-300",
    bad: "ring-red-300",
  };
  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full ring-2 ${toneRing[tone]}`}>
      <span className="text-slate-500">{label}:</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

/* =========================
 * LabeledInput (extendido)
 * ========================= */
export function LabeledInput({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  suffix,
  min,
  max,
  step,
  className = "",
  ...rest
}: {
  label: React.ReactNode;
  value: any;
  onChange: (v: any) => void;
  type?: string;
  placeholder?: string;
  suffix?: React.ReactNode; // texto/unidad a la derecha (opcional)
  min?: number;
  max?: number;
  step?: number;
  className?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block text-sm">
      <div className="text-slate-500 mb-1">{label}</div>
      <div className="mt-1 flex items-center gap-2">
        <input
          className={`w-full px-3 py-2 rounded-xl bg-white border border-slate-200 ${className}`}
          value={value ?? ""}
          onChange={(e) => onChange((e.target as HTMLInputElement).value)}
          type={type}
          placeholder={placeholder}
          min={min}
          max={max}
          step={step}
          {...rest}
        />
        {suffix ? <span className="text-slate-500">{suffix}</span> : null}
      </div>
    </label>
  );
}

/* =========================
 * KeyVal
 * ========================= */
export function KeyVal({ k, v }: { k: React.ReactNode; v: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-1">
      <div className="text-slate-500">{k}</div>
      <div className="font-medium">{v}</div>
    </div>
  );
}

/* =========================
 * RoleBadge
 * ========================= */
export function RoleBadge({ role }: { role: Role }) {
  const tone = role === "admin" ? "bad" : role === "supervisor" ? "warn" : "ok";
  return <Badge tone={tone}>{role.toUpperCase()}</Badge>;
}
