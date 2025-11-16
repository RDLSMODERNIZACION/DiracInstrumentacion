import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

const isProd = process.env.NODE_ENV === "production";

export default defineConfig({
  // 👇 Igual que infraestructura, pero para /kpi/
  base: isProd ? "/kpi/" : "/",

  plugins: [react()],

  server: {
    port: 5174,
    strictPort: true,
    open: false,
  },

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },

  build: {
    sourcemap: false,
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom"],
          recharts: ["recharts"],
        },
      },
    },
  },

  envPrefix: "VITE_",
});
