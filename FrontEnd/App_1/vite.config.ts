import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

const isProd = process.env.NODE_ENV === "production";

export default defineConfig({
  // 👉 En producción servirá desde /kpi/, en desarrollo desde raíz
  base: isProd ? "/kpi/" : "/",

  plugins: [react()],

  // 👇 Puerto fijo para evitar conflictos con App_2 y la Principal
  server: {
    port: 5174,
    strictPort: true,
    open: false
  },

  // 👇 Alias para imports tipo "@/components"
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src")
    }
  },

  // 👇 Configuración de build más limpia y óptima
  build: {
    sourcemap: false,
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        // Divide dependencias grandes en chunks separados
        manualChunks: {
          react: ["react", "react-dom"],
          recharts: ["recharts"]
        }
      }
    }
  },

  // 👇 Prefijo para variables de entorno
  envPrefix: "VITE_"
});
