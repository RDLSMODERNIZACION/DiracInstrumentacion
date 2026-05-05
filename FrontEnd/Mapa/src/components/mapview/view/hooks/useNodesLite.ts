import React from "react";

import { fetchNodesLiteSafe } from "../../mapHelpers";
import type { NodeLite } from "../../mapTypes";

export function useNodesLite() {
  const [nodesLite, setNodesLite] = React.useState<NodeLite[]>([]);
  const [nodesBusy, setNodesBusy] = React.useState(false);

  const ensureNodes = React.useCallback(async () => {
    if (nodesBusy) return;

    setNodesBusy(true);

    try {
      const items = await fetchNodesLiteSafe();
      setNodesLite(items);
    } finally {
      setNodesBusy(false);
    }
  }, [nodesBusy]);

  return {
    nodesLite,
    nodesBusy,
    ensureNodes,
  };
}
