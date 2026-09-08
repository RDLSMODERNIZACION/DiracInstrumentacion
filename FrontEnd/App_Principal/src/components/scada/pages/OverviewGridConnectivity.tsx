import React from "react";
import {
  OverviewGrid as BaseOverviewGrid,
  type ConnStatus,
} from "./OverviewGrid";

// Criterio único de visibilidad para Operaciones:
// tanques y bombas permanecen visibles durante 3 minutos sin datos.
const CONNECTED_WINDOW_SEC = 180;
const WARN_AFTER_SEC = 120;

type Props = React.ComponentProps<typeof BaseOverviewGrid>;

function normalizeStatus(status?: Record<string, ConnStatus>) {
  const out: Record<string, ConnStatus> = {};

  for (const [key, value] of Object.entries(status ?? {})) {
    const ageSec = Number(value?.ageSec);
    const age = Number.isFinite(ageSec) ? Math.max(0, ageSec) : Number.POSITIVE_INFINITY;

    out[key] = {
      ageSec: age,
      online: age <= CONNECTED_WINDOW_SEC,
      tone:
        age <= WARN_AFTER_SEC
          ? "ok"
          : age <= CONNECTED_WINDOW_SEC
          ? "warn"
          : "bad",
    };
  }

  return out;
}

/**
 * Wrapper de Operaciones que fuerza el mismo timeout para ambos tipos de activo.
 * También neutraliza `latest.ts` dentro del grid para que una marca temporal
 * secundaria (por ejemplo event_ts de bomba) no pueda pisar el criterio común
 * basado en age_sec/ageSec.
 */
export function OverviewGrid(props: Props) {
  const fixedStatusByKey = React.useMemo(
    () => normalizeStatus(props.statusByKey),
    [props.statusByKey]
  );

  const fixedPlant = React.useMemo(() => {
    const plant = props.plant ?? {};

    return {
      ...plant,
      tanks: (plant.tanks ?? []).map((tank: any) => ({
        ...tank,
        latest: tank?.latest ? { ...tank.latest, ts: null } : undefined,
      })),
      pumps: (plant.pumps ?? []).map((pump: any) => ({
        ...pump,
        latest: pump?.latest ? { ...pump.latest, ts: null } : undefined,
      })),
    };
  }, [props.plant]);

  return (
    <BaseOverviewGrid
      {...props}
      plant={fixedPlant}
      statusByKey={fixedStatusByKey}
    />
  );
}
