import { fileURLToPath, URL } from "node:url";

import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import vuetify from "vite-plugin-vuetify";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    // autoImport cuida do tree-shaking dos componentes Vuetify usados nos SFCs
    vuetify({ autoImport: true }),
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      // Em desenvolvimento, o backend Express roda em outra porta (ver
      // server/index.ts e o script "dev:server"). Este proxy faz o
      // navegador enxergar tudo como "same-origin" — nada de CORS.
      "/api": {
        target: process.env.VITE_DEV_API_PROXY_TARGET ?? "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
  define: {
    // Silencia o aviso de "Options API" do Vue em produção; a aplicação usa Composition API.
    __VUE_OPTIONS_API__: true,
    __VUE_PROD_DEVTOOLS__: false,
  },
});
