import React from "react";
import ReactDOM from "react-dom/client";

import App from "./App";
import "./styles.css";

// ✅ Leaflet-Geoman (editor de recorridos)
import "@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css";
import "@geoman-io/leaflet-geoman-free";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
