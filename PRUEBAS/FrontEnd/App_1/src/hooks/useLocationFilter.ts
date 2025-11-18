// src/hooks/useLocationFilter.ts
import { useMemo, useState } from "react";

type AnyObj = Record<string, any>;
type Overview = AnyObj;
type Location = { id: number; code?: string; name?: string };

type Input = {
  overview?: Overview;
  locations?: Location[];
};

const DEBUG = true;

export function useLocationFilter({ overview, locations }: Input) {
  const list: Location[] = Array.isArray(locations) ? locations : [];
  const [loc, setLoc] = useState<number | "all">("all");

  const selectedLoc: Location | null = useMemo(() => {
    if (loc === "all") return null;
    return list.find((l) => Number(l?.id) === Number(loc)) || null;
  }, [loc, list]);

  const filtered = useMemo(() => {
    const ov: Overview = overview ?? {};
    if (DEBUG) {
      console.groupCollapsed("[useLocationFilter] INPUT");
      console.log("loc =", loc, "selectedLoc =", selectedLoc);
      console.log("overview.keys =", ov ? Object.keys(ov) : "(null)");
      console.log("locations.count =", list.length, list);
      console.groupEnd();
    }

    if (!selectedLoc || !ov) {
      const out = { overview: ov, locations: list };
      if (DEBUG) {
        const o = out.overview || {};
        console.groupCollapsed("[useLocationFilter] OUTPUT (all)");
        console.log("summary30d =", o.summary30d);
        console.log("assets =", o.assets);
        console.log("latest =", o.latest);
        console.log("timeseries =", o.timeseries);
        console.groupEnd();
      }
      return out;
    }

    // copia superficial
    const out: Overview = { ...ov };

    // Location “seleccionada”
    out.location = {
      id: selectedLoc.id,
      code: selectedLoc.code ?? selectedLoc.id,
      name: selectedLoc.name ?? String(selectedLoc.id),
    };

    // summary30d tal cual (si tu backend ya lo trae por loc, reemplazá acá)
    out.summary30d = ov.summary30d ?? {};

    // latest filtrado si hay location_id
    const latest = ov.latest ?? {};
    out.latest = {
      tanks: Array.isArray(latest.tanks)
        ? latest.tanks.filter((t: any) => t?.location_id == null || t.location_id === selectedLoc.id)
        : [],
      pumps: Array.isArray(latest.pumps)
        ? latest.pumps.filter((p: any) => p?.location_id == null || p.location_id === selectedLoc.id)
        : [],
    };

    // assets filtrados si hay location_id
    const assets = ov.assets ?? {};
    out.assets = {
      tanks: Array.isArray(assets.tanks)
        ? assets.tanks.filter((a: any) => a?.location_id == null || a.location_id === selectedLoc.id)
        : [],
      pumps: Array.isArray(assets.pumps)
        ? assets.pumps.filter((a: any) => a?.location_id == null || a.location_id === selectedLoc.id)
        : [],
      valves: Array.isArray(assets.valves)
        ? assets.valves.filter((a: any) => a?.location_id == null || a.location_id === selectedLoc.id)
        : [],
      manifolds: Array.isArray(assets.manifolds)
        ? assets.manifolds.filter((a: any) => a?.location_id == null || a.location_id === selectedLoc.id)
        : [],
    };

    // timeseries: si tenés ids por asset, recortamos a los ids filtrados
    const ts = ov.timeseries ?? {};
    const pumpsTs = ts.pumps ?? {};
    const tanksTs = ts.tanks ?? {};

    const pumpIdsAllowed = new Set(
      (out.assets.pumps as any[]).map((p: any) => String(p?.id)).filter(Boolean)
    );
    const tankIdsAllowed = new Set(
      (out.assets.tanks as any[]).map((t: any) => String(t?.id)).filter(Boolean)
    );

    const filteredPumpsTs =
      pumpIdsAllowed.size > 0
        ? Object.fromEntries(
            Object.entries(pumpsTs).filter(([id]) => pumpIdsAllowed.has(String(id)))
          )
        : pumpsTs;

    const filteredTanksTs =
      tankIdsAllowed.size > 0
        ? Object.fromEntries(
            Object.entries(tanksTs).filter(([id]) => tankIdsAllowed.has(String(id)))
          )
        : tanksTs;

    out.timeseries = { ...ts, pumps: filteredPumpsTs, tanks: filteredTanksTs };

    const payload = { overview: out, locations: list };

    if (DEBUG) {
      console.groupCollapsed("[useLocationFilter] OUTPUT (filtered)");
      console.log("location =", out.location);
      console.log("summary30d =", out.summary30d);
      console.log("assets.counts =", {
        pumps: out.assets.pumps?.length ?? 0,
        tanks: out.assets.tanks?.length ?? 0,
        valves: out.assets.valves?.length ?? 0,
        manifolds: out.assets.manifolds?.length ?? 0,
      });
      console.log("latest.counts =", {
        pumps: out.latest.pumps?.length ?? 0,
        tanks: out.latest.tanks?.length ?? 0,
      });
      console.log("timeseries.keys =", {
        pumps: Object.keys(out.timeseries?.pumps ?? {}).length,
        tanks: Object.keys(out.timeseries?.tanks ?? {}).length,
      });
      console.groupEnd();
    }

    return payload;
  }, [overview, list, selectedLoc, loc]);

  return { loc, setLoc, filtered };
}
