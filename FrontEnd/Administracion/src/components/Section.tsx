import React from "react";
export default function Section({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section className="bg-white shadow-sm border border-slate-200 rounded-xl p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}
