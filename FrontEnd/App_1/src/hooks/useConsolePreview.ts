import { useEffect } from "react";


export function useConsolePreview(data: any) {
useEffect(() => {
console.group("[Preview] KPIs");
console.table(data.kpis); console.groupEnd();


console.group("[Preview] byLocation");
console.table(
data.byLocation.map((x: any) => ({
code: x.location_code,
assets: x.assets_total,
alarms: x.alarms_active,
avgFlow: x.avg_flow_lpm_30d,
avgLevel: x.avg_level_pct_30d,
}))
);
console.groupEnd();


console.group("[Preview] Latest – Tanks"); console.table(data.latest.tanks); console.groupEnd();
console.group("[Preview] Latest – Pumps"); console.table(data.latest.pumps); console.groupEnd();
}, [data]);
}