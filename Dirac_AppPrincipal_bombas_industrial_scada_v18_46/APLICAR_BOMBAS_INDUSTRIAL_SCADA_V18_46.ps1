$ErrorActionPreference = "Stop"

$widgets = ".\FrontEnd\App_Principal\src\components\scada\widgets.tsx"
$usePlant = ".\FrontEnd\App_Principal\src\components\scada\hooks\usePlant.ts"
$overview = ".\FrontEnd\App_Principal\src\components\scada\pages\OverviewGrid.tsx"
$pumpsBackend = ".\Backend\app\routes\pumps.py"

foreach ($f in @($widgets,$usePlant,$overview,$pumpsBackend)) {
  if (!(Test-Path $f)) {
    throw "No encuentro $f. Ejecuta desde la raiz de DiracInstrumentacion."
  }
}

function Write-Utf8NoBom([string]$path, [string]$content) {
  $enc = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($path, $content, $enc)
}

Write-Host "Aplicando V18.46 - bombas estilo industrial SCADA..." -ForegroundColor Cyan

# ============================================================
# 1) BACKEND /pumps/config: disponibilidad + runtime 24h
# ============================================================
$b = [System.IO.File]::ReadAllText($pumpsBackend)

if ($b -notmatch 'disponibilidad_descripcion') {
  $b = $b.Replace(
    '      p.criticidad,',
    @'
      p.criticidad,
      p.disponible,
      p.disponibilidad_descripcion,
      p.tipo_indisponibilidad,
      p.disponibilidad_actualizada_at,
      p.rol_red,
      ks.starts_24h,
      ks.stops_24h,
      ks.running_seconds_24h,
'@
  )

  $b = $b.Replace(
    '    LEFT JOIN public.pumps p' + "`r`n" + '      ON p.id = v.pump_id',
    '    LEFT JOIN public.pumps p' + "`r`n" + '      ON p.id = v.pump_id' + "`r`n" +
    '    LEFT JOIN kpi.v_operation_pump_summary_24h_full ks' + "`r`n" +
    '      ON ks.pump_id = v.pump_id'
  )

  if ($b -notmatch 'LEFT JOIN kpi\.v_operation_pump_summary_24h_full') {
    $b = $b.Replace(
      '    LEFT JOIN public.pumps p' + "`n" + '      ON p.id = v.pump_id',
      '    LEFT JOIN public.pumps p' + "`n" + '      ON p.id = v.pump_id' + "`n" +
      '    LEFT JOIN kpi.v_operation_pump_summary_24h_full ks' + "`n" +
      '      ON ks.pump_id = v.pump_id'
    )
  }

  $outAnchor = '                "criticality": r.get("criticidad"),'
  if (!$b.Contains($outAnchor)) {
    throw "No encontre criticality en pumps.py"
  }

  $extra = @'
                "criticality": r.get("criticidad"),
                "available": bool(r["disponible"]) if r.get("disponible") is not None else True,
                "availability_description": r.get("disponibilidad_descripcion"),
                "availability_type": r.get("tipo_indisponibilidad"),
                "availability_updated_at": _jsonable(r.get("disponibilidad_actualizada_at")),
                "network_role": r.get("rol_red"),
                "starts_24h": int(r["starts_24h"]) if r.get("starts_24h") is not None else 0,
                "stops_24h": int(r["stops_24h"]) if r.get("stops_24h") is not None else 0,
                "running_seconds_24h": int(r["running_seconds_24h"]) if r.get("running_seconds_24h") is not None else 0,
                "running_hours_24h": round((float(r["running_seconds_24h"]) / 3600.0), 2) if r.get("running_seconds_24h") is not None else 0.0,
'@
  $b = $b.Replace($outAnchor, $extra)

  Write-Utf8NoBom $pumpsBackend $b
}

# ============================================================
# 2) FRONT usePlant: mapear nuevos campos
# ============================================================
$u = [System.IO.File]::ReadAllText($usePlant)

if ($u -notmatch 'running_hours_24h') {
  $typeAnchor = '  criticality?: string | null;'
  if (!$u.Contains($typeAnchor)) {
    throw "No encontre tipo Pump en usePlant.ts"
  }

  $typeExtra = @'
  criticality?: string | null;

  available?: boolean;
  availability_description?: string | null;
  availability_type?: string | null;
  availability_updated_at?: string | null;
  network_role?: string | null;
  starts_24h?: number;
  stops_24h?: number;
  running_seconds_24h?: number;
  running_hours_24h?: number;
'@
  $u = $u.Replace($typeAnchor, $typeExtra)

  $mapAnchor = '      criticality: r.criticality ?? null,'
  if (!$u.Contains($mapAnchor)) {
    throw "No encontre criticality mapping en usePlant.ts"
  }

  $mapExtra = @'
      criticality: r.criticality ?? null,

      available:
        typeof r.available === "boolean"
          ? r.available
          : typeof r.disponible === "boolean"
          ? r.disponible
          : true,
      availability_description:
        r.availability_description ?? r.disponibilidad_descripcion ?? null,
      availability_type:
        r.availability_type ?? r.tipo_indisponibilidad ?? null,
      availability_updated_at:
        r.availability_updated_at ?? r.disponibilidad_actualizada_at ?? null,
      network_role: r.network_role ?? r.rol_red ?? null,
      starts_24h: toNumOr(0, r.starts_24h),
      stops_24h: toNumOr(0, r.stops_24h),
      running_seconds_24h: toNumOr(0, r.running_seconds_24h),
      running_hours_24h: toNumOr(0, r.running_hours_24h),
'@
  $u = $u.Replace($mapAnchor, $mapExtra)

  Write-Utf8NoBom $usePlant $u
}

# ============================================================
# 3) REEMPLAZAR PumpCard completa
# ============================================================
$w = [System.IO.File]::ReadAllText($widgets)

$start = $w.IndexOf('export function PumpCard({')
if ($start -lt 0) {
  throw "No encontre PumpCard."
}

$end = $w.IndexOf('/* =====================', $start + 20)
while ($end -ge 0 -and $w.Substring($end, [Math]::Min(160, $w.Length - $end)) -notmatch 'Compartidos') {
  $end = $w.IndexOf('/* =====================', $end + 10)
}

if ($end -lt 0) {
  throw "No pude localizar el final de PumpCard."
}

$newPumpCard = @'
export function PumpCard({
  pump,
  onClick,
  signal = "ok",
  status,
}: {
  pump: any;
  onClick?: () => void;
  signal?: "ok" | "warn" | "bad";
  status?: ConnStatus;
}) {
  const state: "run" | "stop" | undefined =
    pump?.state === "run" || pump?.state === "stop"
      ? pump.state
      : undefined;

  const ageSecFromRow =
    Number.isFinite(pump?.age_sec)
      ? Number(pump.age_sec)
      : Number.isFinite(pump?.ageSec)
      ? Number(pump.ageSec)
      : undefined;

  const onlineFromRow =
    typeof pump?.online === "boolean"
      ? pump.online
      : Number.isFinite(ageSecFromRow)
      ? (ageSecFromRow as number) < CRIT_SEC
      : false;

  const ts: string | null =
    pump?.hb_ts ?? pump?.event_ts ?? pump?.latest?.ts ?? null;

  const derivedAge = Number.isFinite(ageSecFromRow)
    ? (ageSecFromRow as number)
    : secSince(ts);

  const derivedTone: ConnStatus["tone"] =
    onlineFromRow
      ? "ok"
      : derivedAge < WARN_SEC
      ? "warn"
      : "bad";

  const conn: ConnStatus =
    status ?? {
      online: onlineFromRow,
      ageSec: derivedAge,
      tone: derivedTone,
    };

  const title = String(pump?.name ?? "Bomba");
  const isOn = state === "run";
  const available =
    typeof pump?.available === "boolean" ? pump.available : true;

  const availabilityType = String(
    pump?.availability_type ?? ""
  ).trim();

  const availabilityDescription = String(
    pump?.availability_description ?? ""
  ).trim();

  const runningHours = Number(pump?.running_hours_24h ?? 0);
  const starts24h = Number(pump?.starts_24h ?? 0);
  const nominalPower = Number(pump?.power_kw);

  const ledClass =
    !conn.online
      ? "bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.75)]"
      : !available
      ? "bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.65)]"
      : isOn
      ? "bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.75)]"
      : "bg-slate-500";

  const stateText =
    !conn.online
      ? "SIN COMUNICACION"
      : isOn
      ? "ENCENDIDA"
      : "APAGADA";

  const stateClass =
    !conn.online
      ? "text-rose-400"
      : isOn
      ? "text-emerald-400"
      : "text-slate-400";

  const availabilityLabel =
    !available
      ? availabilityType
        ? availabilityType.toUpperCase()
        : "NO DISPONIBLE"
      : "DISPONIBLE";

  const availabilityClass =
    !available
      ? "border-amber-400/70 bg-amber-400/10 text-amber-300"
      : "border-emerald-400/70 bg-emerald-400/10 text-emerald-300";

  return (
    <button
      onClick={onClick}
      className={[
        "group relative block w-full min-w-0 overflow-hidden rounded-xl border",
        "border-slate-700 bg-[#111820] px-3 py-3 text-left",
        "shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]",
        "transition hover:border-slate-600 active:scale-[0.995]",
      ].join(" ")}
      aria-label={`Bomba ${title}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5">
            <span
              className={`h-2.5 w-2.5 shrink-0 rounded-full border border-black/20 ${ledClass}`}
            />
            <div className="truncate font-mono text-[15px] font-black tracking-wide text-slate-100">
              {title}
            </div>
          </div>

          <div className={`mt-3 font-mono text-[15px] font-bold tracking-[0.08em] ${stateClass}`}>
            {stateText}
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          <span
            className={[
              "rounded-md border px-2.5 py-1 font-mono text-[10px] font-black tracking-wide",
              availabilityClass,
            ].join(" ")}
          >
            {availabilityLabel}
          </span>

          <span className="font-mono text-lg text-slate-500 transition group-hover:text-slate-300">
            &gt;
          </span>
        </div>
      </div>

      <div className="my-3 h-px bg-slate-700/80" />

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[11px] font-semibold text-slate-400">
        <span>{runningHours.toFixed(1)} h / 24h</span>
        <span className="text-slate-600">|</span>
        <span>{Math.round(starts24h)} arr.</span>

        {Number.isFinite(nominalPower) && nominalPower > 0 ? (
          <>
            <span className="text-slate-600">|</span>
            <span>{nominalPower.toFixed(0)} kW nom.</span>
          </>
        ) : null}
      </div>

      {!available && availabilityDescription ? (
        <div className="mt-2 truncate font-mono text-[11px] text-amber-200/80">
          {availabilityDescription}
        </div>
      ) : null}
    </button>
  );
}

'@

$w = $w.Substring(0, $start) + $newPumpCard + $w.Substring($end)
Write-Utf8NoBom $widgets $w

# ============================================================
# 4) OVERVIEW: dark industrial solo en grupos/operaciones
# ============================================================
$o = [System.IO.File]::ReadAllText($overview)

$o = $o.Replace(
  'className="rounded-xl border border-slate-200 bg-white shadow-sm p-2.5 sm:rounded-2xl sm:p-4"',
  'className="rounded-xl border border-slate-800 bg-[#0b1118] shadow-sm p-2.5 sm:rounded-2xl sm:p-4"'
)
$o = $o.Replace(
  'className="text-sm font-bold text-slate-900 truncate"',
  'className="text-sm font-bold text-slate-100 truncate"'
)
$o = $o.Replace(
  'className="mt-1 text-[11px] font-semibold text-slate-600"',
  'className="mt-1 text-[11px] font-semibold text-slate-400"'
)
$o = $o.Replace(
  'className="mt-0.5 text-[11px] text-slate-500"',
  'className="mt-0.5 text-[11px] text-slate-500"'
)

Write-Utf8NoBom $overview $o

Write-Host ""
Write-Host "V18.46 aplicado correctamente." -ForegroundColor Green
Write-Host ""
Write-Host "Bombas ahora muestran:" -ForegroundColor Cyan
Write-Host "- LED pequeno"
Write-Host "- nombre tecnico"
Write-Host "- ENCENDIDA / APAGADA"
Write-Host "- DISPONIBLE / NO DISPONIBLE"
Write-Host "- horas de marcha ultimas 24h"
Write-Host "- arranques ultimas 24h"
Write-Host "- potencia nominal si esta cargada"
Write-Host "- motivo si esta no disponible"
Write-Host ""
Write-Host "No se inventan amperes porque hoy /pumps/config no trae corriente individual." -ForegroundColor Yellow
Write-Host ""
Write-Host "Proba:" -ForegroundColor Yellow
Write-Host "cd FrontEnd\App_Principal"
Write-Host "npm run build"
