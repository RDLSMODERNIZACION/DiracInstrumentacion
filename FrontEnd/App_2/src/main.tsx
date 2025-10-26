import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Busca el contenedor principal
const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("No se encontró el elemento #root en el HTML");
}

const root = createRoot(rootElement);

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
