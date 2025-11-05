import React from "react";

export default function SlideOver({
  open,
  title,
  onClose,
  children,
  right
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="absolute right-0 top-0 h-full w-full max-w-xl bg-white shadow-xl border-l border-slate-200 flex flex-col">
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <h3 className="font-semibold">{title}</h3>
          <div className="flex items-center gap-3">
            {right}
            <button onClick={onClose} className="text-slate-500 hover:text-slate-800">✕</button>
          </div>
        </div>
        <div className="p-4 overflow-auto">{children}</div>
      </div>
    </div>
  );
}
