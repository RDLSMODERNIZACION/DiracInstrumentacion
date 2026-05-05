// src/components/mapview/view/components/MapAssetsPanelHost.tsx

import MapAssetsPanel from "../../MapAssetsPanel";
import type { MapAssetLive } from "../../../../services/mapasagua";
import type { AssetLinkMode } from "../types";

export default function MapAssetsPanelHost({
  open,
  assets,
  busy,
  error,
  selectedAsset,
  linkMode,
  onClose,
  onRefresh,
  onSelectAsset,
  onStartLinkNode,
  onStartLinkPipe,
  onCancelLink,
  onUnlink,
}: {
  open: boolean;
  assets: MapAssetLive[];
  busy: boolean;
  error: string | null;
  selectedAsset: MapAssetLive | null;
  linkMode: AssetLinkMode;
  onClose: () => void;
  onRefresh: () => void | Promise<void>;
  onSelectAsset: (asset: MapAssetLive) => void;
  onStartLinkNode: () => void | Promise<void>;
  onStartLinkPipe: () => void | Promise<void>;
  onCancelLink: () => void;
  onUnlink: () => void | Promise<void>;
}) {
  return (
    <MapAssetsPanel
      open={open}
      assets={assets}
      busy={busy}
      error={error}
      selectedAsset={selectedAsset}
      linkMode={linkMode}
      onClose={onClose}
      onRefresh={onRefresh}
      onSelectAsset={onSelectAsset}
      onStartLinkNode={onStartLinkNode}
      onStartLinkPipe={onStartLinkPipe}
      onCancelLink={onCancelLink}
      onUnlink={onUnlink}
    />
  );
}
