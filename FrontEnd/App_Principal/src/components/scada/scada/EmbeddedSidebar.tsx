// src/components/scada/EmbeddedAppFrame.tsx
import React from "react";

export default function EmbeddedAppFrame({
  src,
  title,
}: {
  src: string;
  title: string;
}) {
  const [ready, setReady] = React.useState(false);

  return (
    <div className="w-full h-[calc(100vh-56px)]"> {/* 56px ~ header */}
      {!ready && (
        <div className="p-6 text-sm text-slate-500">
          Cargando {title}…
        </div>
      )}
      <iframe
        src={src}
        title={title}
        className="w-full h-full border-0"
        sandbox="
          allow-scripts
          allow-same-origin
          allow-forms
          allow-top-navigation-by-user-activation
          allow-popups
          allow-popups-to-escape-sandbox
        "
        onLoad={() => setReady(true)}
      />
    </div>
  );
}
