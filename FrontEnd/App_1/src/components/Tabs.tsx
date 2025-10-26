export function Tabs({ value, onChange, tabs }: { value: string; onChange: (v: string) => void; tabs: { id: string; label: string }[]; }) {
return (
<div>
<div className="flex gap-2 border-b overflow-x-auto">
{tabs.map((t) => (
<button
key={t.id}
onClick={() => onChange(t.id)}
className={`px-3 py-2 text-sm border-b-2 -mb-px ${value === t.id ? "border-gray-900 font-medium" : "border-transparent text-gray-500"}`}
>
{t.label}
</button>
))}
</div>
</div>
);
}