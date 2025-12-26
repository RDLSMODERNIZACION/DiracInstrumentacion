import L from "leaflet";

export function locationMarkerIcon(label: string, selected: boolean, scale = 1, opacity = 1) {
  const glow = selected
    ? "0 0 0 2px rgba(34,211,238,.35), 0 20px 40px rgba(0,0,0,.35)"
    : "0 12px 30px rgba(0,0,0,.35)";
  const bg = selected ? "rgba(34,211,238,0.22)" : "rgba(0,0,0,0.30)";
  const border = selected ? "1px solid rgba(34,211,238,0.45)" : "1px solid rgba(255,255,255,0.14)";

  return new L.DivIcon({
    className: "",
    html: `
      <div style="
        transform: scale(${scale});
        transform-origin: left center;
        opacity: ${opacity};
        pointer-events: auto;
        display:flex;align-items:center;gap:10px;
        padding: 10px 12px;
        border-radius: 16px;
        background: ${bg};
        border:${border};
        backdrop-filter: blur(10px);
        box-shadow: ${glow};
        color: rgba(255,255,255,0.92);
        max-width: 240px;
        white-space: nowrap;
      ">
        <div style="
          width:14px;height:14px;border-radius:999px;
          background: rgba(34,211,238,0.95);
          box-shadow: 0 0 0 2px rgba(255,255,255,0.85);
        "></div>
        <div style="
          font-weight: 900;
          font-size: 12px;
          letter-spacing: .4px;
          text-transform: uppercase;
          overflow:hidden;text-overflow:ellipsis;
        ">${label}</div>
      </div>
    `,
    iconSize: [220, 42],
    iconAnchor: [18, 21],
  });
}

// ✅ Marcador “A/B” para foco: interactive false en Marker (lo seteamos en MapView)
export function focusPointIcon(label: string) {
  return new L.DivIcon({
    className: "",
    html: `
      <div style="
        pointer-events:none;
        display:flex;align-items:center;gap:8px;
        padding: 8px 10px;
        border-radius: 14px;
        background: rgba(0,0,0,0.35);
        border: 1px solid rgba(255,255,255,0.14);
        backdrop-filter: blur(10px);
        box-shadow: 0 12px 30px rgba(0,0,0,.35);
        color: rgba(255,255,255,0.92);
        white-space: nowrap;
      ">
        <div style="
          width:12px;height:12px;border-radius:999px;
          background: rgba(96,165,250,0.95);
          box-shadow: 0 0 0 2px rgba(255,255,255,0.85);
        "></div>
        <div style="
          font-weight:900;font-size:12px;letter-spacing:.35px;
          max-width:240px;overflow:hidden;text-overflow:ellipsis;
        ">${label}</div>
      </div>
    `,
    iconSize: [240, 38],
    iconAnchor: [18, 19],
  });
}
