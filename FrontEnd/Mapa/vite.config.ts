import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/mapa/", // 🔴 CLAVE: se sirve desde /mapa
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
  },
});
