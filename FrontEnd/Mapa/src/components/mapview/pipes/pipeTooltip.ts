// src/components/mapview/pipes/pipeTooltip.ts

import L from "leaflet";
import type { SimRunResponse } from "./types";
import {
  escapeHtml,
  featureId,
  fmt,
  getConnHint,
  pickLabel,
  shortId,
} from "./pipeFeatureUtils";
import {
  getPipePressureStats,
  pressureColor,
  pressureKindColor,
  pressureKindLabel,
  pressureLabel,
  warningLabel,
} from "./pipePressureUtils";
import { getDiameterMm, inferPipeRole } from "./pipeRoleUtils";

function sourceName(s: any) {
  return s?.label ?? s?.source_name ?? s?.asset_name ?? s?.source_type ?? "—";
}

function sourceKey(s: any) {
  return String(
    s?.source_id ??
      s?.asset_link_id ??
      `${s?.source_type ?? ""}-${s?.asset_type ?? ""}-${s?.asset_id ?? ""}-${sourceName(s)}`
  );
}

function sourceTypeLabel(s: any) {
  if (!s) return "";
  if (s.source_type === "TANK_HEAD") return "Tanque";
  if (s.source_type === "PRESSURE_MEASURE") return "Presión real";
  if (s.source_type === "MANUAL_SOURCE") return "Fuente manual";
  return s.source_type ?? "";
}

function formatSourceLine(s: any) {
  const label = sourceName(s);
  const type = sourceTypeLabel(s);
  const head = s?.head_m != null ? ` · head ${fmt(s.head_m, 1)} m` : "";
  const pressure =
    s?.pressure_bar_real != null ? ` · ${fmt(s.pressure_bar_real, 2)} bar` : "";
  const level = s?.level_pct != null ? ` · nivel ${fmt(s.level_pct, 1)} %` : "";

  return `• ${escapeHtml(label)}${type ? ` · ${escapeHtml(type)}` : ""}${head}${pressure}${level}`;
}

function dedupeSources(sources: any[]) {
  const map = new Map<string, any>();

  for (const s of sources || []) {
    if (!s) continue;

    const key = sourceKey(s);
    const old = map.get(key);

    if (!old) {
      map.set(key, s);
      continue;
    }

    const oldHead = Number(old.head_m ?? -Infinity);
    const newHead = Number(s.head_m ?? -Infinity);

    if (newHead > oldHead) {
      map.set(key, s);
    }
  }

  return Array.from(map.values());
}

function buildSourceSummaryHtml(args: {
  srcU: any;
  srcV: any;
  reaching: any[];
}) {
  const { srcU, srcV, reaching } = args;

  const uName = sourceName(srcU);
  const vName = sourceName(srcV);

  const uKey = sourceKey(srcU);
  const vKey = sourceKey(srcV);

  const hasU = !!srcU;
  const hasV = !!srcV;

  let dominantHtml = "";

  if (hasU && hasV && uKey === vKey) {
    dominantHtml = `
      <div class="pipeTooltipCard__sourceBox">
        <b>Fuente dominante</b><br/>
        ${escapeHtml(uName)}
        <div class="pipeTooltipCard__mutedSmall">
          Ambos extremos del tramo están dominados por la misma fuente.
        </div>
      </div>
    `;
  } else if (hasU || hasV) {
    dominantHtml = `
      <div class="pipeTooltipCard__sourceBox">
        <b>Fuentes dominantes del tramo</b><br/>
        ${hasU ? `U: ${escapeHtml(uName)}` : "U: —"}<br/>
        ${hasV ? `V: ${escapeHtml(vName)}` : "V: —"}
      </div>
    `;
  }

  const dominantKeys = new Set<string>();
  if (srcU) dominantKeys.add(sourceKey(srcU));
  if (srcV) dominantKeys.add(sourceKey(srcV));

  const extras = dedupeSources(reaching || []).filter((s) => !dominantKeys.has(sourceKey(s)));

  const extrasHtml = extras.length
    ? `
      <div class="pipeTooltipCard__alsoBox">
        <b>También llega</b><br/>
        ${extras
          .slice(0, 5)
          .map((s) => `<div>${formatSourceLine(s)}</div>`)
          .join("")}
      </div>
    `
    : "";

  return `${dominantHtml}${extrasHtml}`;
}

export function bindPipeTooltip(layer: L.Layer, feature: any, sim: SimRunResponse | null) {
  const id = featureId(feature);
  const label = pickLabel(feature);
  const ps = id && sim?.pipes ? sim.pipes[id] : null;

  const conn = getConnHint(feature);
  const unconnected = !conn.connected;

  const p = feature?.properties ?? {};
  const lengthM = p.length_m ?? ps?.length_m ?? null;
  const diam = getDiameterMm(feature, sim);
  const role = inferPipeRole(feature);

  const pressure = getPipePressureStats(sim, id);

  const pressureValue = pressure?.min_bar ?? pressure?.avg_bar;
  const pressureBadgeColor = pressureColor(pressureValue);
  const pressureText = pressureLabel(pressureValue);

  const kind = pressure?.pressure_kind ?? ps?.pressure_kind ?? null;
  const kindColor = pressureKindColor(kind);
  const kindLabel = pressureKindLabel(kind);

  const warnings: string[] = pressure?.warnings ?? ps?.warnings ?? [];
  const sourceMix = pressure?.source_mix ?? ps?.source_mix ?? null;

  const srcU = pressure?.origin_source_u;
  const srcV = pressure?.origin_source_v;
  const reaching = pressure?.sources_reaching ?? ps?.sources_reaching ?? [];

  const title = label || "Cañería";

  const warningHtml = warnings.length
    ? `
      <div class="pipeTooltipCard__warning">
        <b>Alertas</b>
        ${warnings
          .slice(0, 4)
          .map((w) => `<div>• ${escapeHtml(warningLabel(w))}</div>`)
          .join("")}
      </div>
    `
    : "";

  const sourceSummaryHtml =
    ps && (srcU || srcV || reaching.length)
      ? buildSourceSummaryHtml({
          srcU,
          srcV,
          reaching,
        })
      : "";

  const pressureHtml = ps
    ? `
      <div class="pipeTooltipCard__badges">
        <span style="background:${pressureBadgeColor};color:#08111f">${escapeHtml(
          pressureText
        )}</span>
        <span style="background:${kindColor};color:#08111f">${escapeHtml(
          kindLabel
        )}</span>
      </div>

      <div class="pipeTooltipCard__row">
        <b>Presión tramo</b>: mín ${fmt(pressure?.min_bar)} bar · prom ${fmt(
        pressure?.avg_bar
      )} bar
      </div>

      ${
        sourceMix
          ? `<div class="pipeTooltipCard__row"><b>Mezcla</b>: ${escapeHtml(
              sourceMix
            )}</div>`
          : ""
      }

      ${sourceSummaryHtml}

      ${warningHtml}
    `
    : sim && id
    ? `<div class="pipeTooltipCard__muted">Sin datos de simulación para esta cañería</div>`
    : "";

  const html = `
    <div class="pipeTooltipCard">
      <div class="pipeTooltipCard__title">${escapeHtml(title)}</div>

      ${
        id
          ? `<div class="pipeTooltipCard__id">id: ${escapeHtml(shortId(id))}</div>`
          : ""
      }

      <div class="pipeTooltipCard__badges">
        <span class="${unconnected ? "warn" : "ok"}">
          ${unconnected ? "SIN CONECTAR" : "CONECTADA"}
        </span>
      </div>

      <div class="pipeTooltipCard__row">
        <b>Tipo</b>: ${escapeHtml(role.label)}
      </div>

      <div class="pipeTooltipCard__row">
        <b>Long.</b>: ${fmt(lengthM, 1)} m · <b>Ø</b>: ${
    diam == null ? "N/D" : `${fmt(diam, 0)} mm`
  }
      </div>

      ${
        conn.connected
          ? `
            <div class="pipeTooltipCard__muted">
              ${escapeHtml(shortId(conn.from_node))} → ${escapeHtml(shortId(conn.to_node))}
            </div>
          `
          : `
            <div class="pipeTooltipCard__warning">
              Falta origen o destino. No entra en simulación.
            </div>
          `
      }

      ${pressureHtml}

      ${
        ps
          ? `
            <div class="pipeTooltipCard__muted">
              Q visual: ${fmt(ps.q_lps, 3)} L/s · ΔH: ${
              ps.dH_m == null ? "N/D" : fmt(ps.dH_m, 2)
            } m
            </div>
          `
          : ""
      }
    </div>
  `;

  try {
    (layer as any).unbindTooltip?.();

    (layer as any).bindTooltip(html, {
      sticky: true,
      direction: "top",
      offset: [12, -12],
      opacity: 1,
      className: "pipeTooltipDark",
    });
  } catch {}
}