import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({ plugins: [react()], server: {proxy: {"/api": {target:"http://127.0.0.1:4187",changeOrigin:false}, "/fixtures": "http://127.0.0.1:4187"}}, build: { outDir: "dist", rolldownOptions: { input: { main: "index.html", loading: "loading-preview.html", site: "site-preview.html" } } } });
