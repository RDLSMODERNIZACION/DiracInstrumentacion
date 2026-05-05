// src/components/mapview/view/hooks/useNodesController.ts

import React from "react";
import { fillNodeElevations } from "../../../../services/mapasagua";
import { fetchNodesLiteSafe } from "../../mapHelpers";
import type { NodeLite } from "../../mapTypes";

function numberOrPrevious(value: any, previous: number | null | undefined) {
  if (value != null && Number.isFinite(Number(value))) return Number(value);
  if (value === null) return null;
  return previous;
}

export default function useNodesController() {
  const [nodesLite, setNodesLite] = React.useState<NodeLite[]>([]);
  const [nodesBusy, setNodesBusy] = React.useState(false);

  async function ensureNodes() {
    if (nodesBusy) return;

    setNodesBusy(true);

    try {
      const items = await fetchNodesLiteSafe();
      setNodesLite(items);
    } finally {
      setNodesBusy(false);
    }
  }

  async function reloadNodes() {
    const items = await fetchNodesLiteSafe();
    setNodesLite(items);
    return items;
  }

  async function refreshNodeElevationsAfterMapChange() {
    try {
      await fillNodeElevations({
        preview: false,
        max_distance_m: 500,
      });

      await reloadNodes();
    } catch (e: any) {
      console.warn("No se pudieron actualizar automáticamente las cotas", e);
    }
  }

  function handleNodeUpdated(updated: any) {
    if (!updated?.id) return;

    setNodesLite((prev) => {
      const updatedId = String(updated.id);
      let found = false;

      const next = prev.map((n) => {
        if (n.id !== updatedId) return n;

        found = true;

        return {
          ...n,
          kind: updated.kind != null ? String(updated.kind) : n.kind,
          label: updated.label != null ? String(updated.label) : n.label,
          lat:
            updated.lat != null && Number.isFinite(Number(updated.lat))
              ? Number(updated.lat)
              : n.lat,
          lng:
            updated.lng != null && Number.isFinite(Number(updated.lng))
              ? Number(updated.lng)
              : n.lng,
          elev_m: numberOrPrevious(updated.elev_m, n.elev_m),
          head_m: numberOrPrevious(updated.head_m, n.head_m),
          demand_lps: numberOrPrevious(updated.demand_lps, n.demand_lps),
          is_source:
            typeof updated.is_source === "boolean" ? updated.is_source : n.is_source,
        };
      });

      if (found) return next;

      return [
        ...next,
        {
          id: updatedId,
          kind: updated.kind != null ? String(updated.kind) : undefined,
          label: updated.label != null ? String(updated.label) : undefined,
          lat:
            updated.lat != null && Number.isFinite(Number(updated.lat))
              ? Number(updated.lat)
              : undefined,
          lng:
            updated.lng != null && Number.isFinite(Number(updated.lng))
              ? Number(updated.lng)
              : undefined,
          elev_m:
            updated.elev_m != null && Number.isFinite(Number(updated.elev_m))
              ? Number(updated.elev_m)
              : null,
          head_m:
            updated.head_m != null && Number.isFinite(Number(updated.head_m))
              ? Number(updated.head_m)
              : null,
          demand_lps:
            updated.demand_lps != null && Number.isFinite(Number(updated.demand_lps))
              ? Number(updated.demand_lps)
              : null,
          is_source:
            typeof updated.is_source === "boolean" ? updated.is_source : false,
        },
      ];
    });
  }

  return {
    nodesLite,
    nodesBusy,
    ensureNodes,
    reloadNodes,
    refreshNodeElevationsAfterMapChange,
    handleNodeUpdated,
  };
}
