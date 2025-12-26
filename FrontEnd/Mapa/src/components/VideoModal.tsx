import React from "react";

export function VideoModal({
  open,
  title,
  url,
  onClose,
}: {
  open: boolean;
  title: string;
  url: string | null;
  onClose: () => void;
}) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const isYouTubeOrEmbed = !!url && /(youtube\.com\/embed\/|player\.vimeo\.com\/video\/)/i.test(url);
  const isMp4 = !!url && /\.mp4(\?|$)/i.test(url);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10000,
        background: "rgba(0,0,0,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
      onMouseDown={(e) => {
        // cerrar si clickeás afuera de la tarjeta
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: "min(980px, 96vw)",
          background: "white",
          borderRadius: 16,
          boxShadow: "0 20px 60px rgba(0,0,0,0.35)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 14px",
            borderBottom: "1px solid rgba(0,0,0,0.08)",
          }}
        >
          <div style={{ fontWeight: 900 }}>{title}</div>
          <button
            onClick={onClose}
            style={{
              border: "1px solid rgba(0,0,0,0.15)",
              background: "white",
              borderRadius: 10,
              padding: "6px 10px",
              cursor: "pointer",
            }}
          >
            Cerrar ✕
          </button>
        </div>

        <div style={{ padding: 14 }}>
          {!url ? (
            <div style={{ padding: 12, opacity: 0.8 }}>Esta localidad no tiene video asignado.</div>
          ) : isMp4 ? (
            <video
              src={url}
              controls
              style={{
                width: "100%",
                height: "auto",
                borderRadius: 12,
                background: "black",
              }}
            />
          ) : (
            <div style={{ position: "relative", width: "100%", paddingTop: "56.25%" }}>
              <iframe
                src={url}
                title={title}
                allow="autoplay; encrypted-media; picture-in-picture"
                allowFullScreen={false}
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  border: 0,
                  borderRadius: 12,
                  background: "black",
                }}
              />
            </div>
          )}

          {url && !isMp4 && !isYouTubeOrEmbed && (
            <div style={{ marginTop: 10, fontSize: 12, opacity: 0.75 }}>
              Tip: si es YouTube, usá formato embed: <code>https://www.youtube.com/embed/ID</code>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
