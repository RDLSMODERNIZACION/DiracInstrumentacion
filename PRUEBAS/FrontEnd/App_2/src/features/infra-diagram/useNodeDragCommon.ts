import useDragNode from "@/hooks/useDragNode";
import type { UINode } from "./types";

export default function useNodeDragCommon(
  n: UINode,
  getPos: any,
  setPos: any,
  onDragEnd: () => void,
  onAnyPointer?: () => void,
  enabled: boolean = true,
) {
  return useDragNode({
    id: n.id,
    enabled,
    snap: 10,
    getPos,
    setPos,
    onEnd: onDragEnd,
    onChange: onAnyPointer,
  } as any);
}
