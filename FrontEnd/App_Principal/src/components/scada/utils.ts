export function labelOfTab(t: string) {
  return t === "overview" ? "Overview"
    : t === "alarms" ? "Alarmas"
    : t === "trends" ? "Tendencias"
    : t === "settings" ? "Configuración"
    : t === "users" ? "Usuarios"
    : "Auditoría";
}

export function severityOf(levelPct: number, th: any) {
  if (levelPct <= th.lowCritical || levelPct >= th.highCritical) return "critico" as const;
  if (levelPct <= th.lowWarning || levelPct >= th.highWarning) return "alerta" as const;
  return "normal" as const;
}

export function sevMeta(sev: "normal" | "alerta" | "critico") {
  return sev === "critico" ? { label: "Crítico", tone: "bad" }
       : sev === "alerta" ? { label: "Alerta",  tone: "warn" }
       : { label: "Normal", tone: "ok" };
}

export function fmtLiters(n: number) {
  return Math.round(n).toLocaleString() + " L";
}
