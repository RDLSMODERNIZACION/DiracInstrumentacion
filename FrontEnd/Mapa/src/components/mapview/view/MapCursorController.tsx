import React from "react";
import { useMap } from "react-leaflet";

import type { InsertMode } from "./types";

function svgCursor(svg: string, fallback: string) {
  const encoded = encodeURIComponent(svg)
    .replace(/'/g, "%27")
    .replace(/"/g, "%22");

  return `url("data:image/svg+xml;utf8,${encoded}") 14 14, ${fallback}`;
}

function cursorForEditMode(mode: InsertMode | "pipe" | "none", busy: boolean) {
  if (busy) return "progress";

  if (mode === "pipe") {
    return svgCursor(
      `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
        <circle cx="14" cy="14" r="10" fill="#2563eb" fill-opacity="0.95" stroke="white" stroke-width="2"/>
        <path d="M14 7v14M7 14h14" stroke="white" stroke-width="3" stroke-linecap="round"/>
      </svg>`,
      "crosshair"
    );
  }

  if (mode === "valve") {
    return svgCursor(
      `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
        <circle cx="14" cy="14" r="10" fill="#ef4444" fill-opacity="0.96" stroke="white" stroke-width="2"/>
        <path d="M9 9l10 10M19 9L9 19" stroke="white" stroke-width="3" stroke-linecap="round"/>
      </svg>`,
      "crosshair"
    );
  }

  if (mode === "tank") {
    return svgCursor(
      `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
        <rect x="7" y="7" width="14" height="16" rx="4" fill="#06b6d4" fill-opacity="0.96" stroke="white" stroke-width="2"/>
        <path d="M9 13h10" stroke="white" stroke-width="2" stroke-linecap="round" opacity="0.9"/>
      </svg>`,
      "crosshair"
    );
  }

  if (mode === "pump") {
    return svgCursor(
      `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
        <circle cx="14" cy="14" r="10" fill="#a855f7" fill-opacity="0.96" stroke="white" stroke-width="2"/>
        <circle cx="14" cy="14" r="4" fill="white"/>
        <path d="M14 4v5M14 19v5M4 14h5M19 14h5" stroke="white" stroke-width="2" stroke-linecap="round"/>
      </svg>`,
      "crosshair"
    );
  }

  return "";
}

export default function MapCursorController({
  insertMode,
  creatingPipe,
  busy,
}: {
  insertMode: InsertMode;
  creatingPipe: boolean;
  busy: boolean;
}) {
  const map = useMap();

  React.useEffect(() => {
    const container = map.getContainer();
    const mode: InsertMode | "pipe" | "none" = creatingPipe
      ? "pipe"
      : insertMode !== "none"
        ? insertMode
        : "none";

    const cursor = cursorForEditMode(mode, busy);

    if (!cursor) {
      container.classList.remove("map-edit-cursor-active");
      container.style.removeProperty("--map-edit-cursor");
      return;
    }

    container.style.setProperty("--map-edit-cursor", cursor);
    container.classList.add("map-edit-cursor-active");

    return () => {
      container.classList.remove("map-edit-cursor-active");
      container.style.removeProperty("--map-edit-cursor");
    };
  }, [map, insertMode, creatingPipe, busy]);

  return (
    <style>
      {`
        .leaflet-container.map-edit-cursor-active,
        .leaflet-container.map-edit-cursor-active * {
          cursor: var(--map-edit-cursor) !important;
        }
      `}
    </style>
  );
}
