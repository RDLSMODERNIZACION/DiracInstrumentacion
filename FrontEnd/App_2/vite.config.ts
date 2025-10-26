import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

const isProd = process.env.NODE_ENV === "production";

export default defineConfig({
  // 👉 En desarrollo sirve en raíz ("/"), en producción bajo subruta "/infraestructura/"
  base: isProd ? "/infraestructura/" : "/",

  plugins: [react()],

  // 👇 Alias para imports tipo "@/components"
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src")
    }
  },

  // 👇 Puertos fijos para evitar conflicto con App_1 (5174) y Principal (5173)
  server: {
    port: 5175,
    strictPort: true,
    open: false
  },
  preview: {
    port: 5175,
    strictPort: true
  },

  // 👇 Build optimizado y limpio
  build: {
    outDir: "dist",
    assetsDir: "assets",
    emptyOutDir: true,
    sourcemap: false,              // cambia a true si necesitás depurar
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
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
