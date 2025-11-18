import { Card, CardHeader, CardTitle } from "@/components/ui/card";

export function KPI({
  label,
  value,
  sub,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
}) {
  return (
    <Card className="rounded-2xl shadow-sm p-3">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm text-gray-500 font-medium">
          {label}
        </CardTitle>
      </CardHeader>

      <div className="text-3xl font-semibold">{value}</div>
      {sub && <div className="text-xs text-gray-500 mt-1">{sub}</div>}
    </Card>
  );
}
