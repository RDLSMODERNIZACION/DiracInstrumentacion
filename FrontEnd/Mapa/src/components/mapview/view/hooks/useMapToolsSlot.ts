// src/components/mapview/view/hooks/useMapToolsSlot.ts

import React from "react";

export default function useMapToolsSlot(slotId = "map-tools-slot") {
  const [slot, setSlot] = React.useState<HTMLElement | null>(null);

  React.useEffect(() => {
    if (typeof document === "undefined") return;

    let tries = 0;
    let timer: number | undefined;

    const findSlot = () => {
      const nextSlot = document.getElementById(slotId);

      if (nextSlot) {
        setSlot(nextSlot);
        if (timer) window.clearInterval(timer);
        return;
      }

      tries += 1;

      if (tries > 40 && timer) {
        window.clearInterval(timer);
      }
    };

    findSlot();
    timer = window.setInterval(findSlot, 150);

    return () => {
      if (timer) window.clearInterval(timer);
    };
  }, [slotId]);

  return slot;
}
