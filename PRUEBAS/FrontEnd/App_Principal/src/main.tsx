// src/main.tsx
import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import AppRoot from "./components/scada/AppRoot";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "./lib/auth";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <AppRoot />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
