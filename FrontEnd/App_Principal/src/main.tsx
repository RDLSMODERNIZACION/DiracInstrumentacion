// src/main.tsx  (o src/index.tsx)
import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import AppRoot from "./components/scada/AppRoot";
import { BrowserRouter } from "react-router-dom";

// No usamos lib/api, ni seteamos API/WS/keys desde acá.
// usePlant ya toma la base del backend desde window.location.origin
// o desde VITE_API_BASE si la definís.

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AppRoot />
    </BrowserRouter>
  </React.StrictMode>
);
