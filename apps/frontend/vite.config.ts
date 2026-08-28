import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    vue(),
    VitePWA({
      // "prompt", nao "autoUpdate": quem decide recarregar e o usuario, no
      // UpdateBanner. Trocar o bundle embaixo de um formulario meio preenchido
      // e a mesma decisao que o useVersionCheck ja tinha tomado — e alinha este
      // app com os outros tres da suite.
      registerType: "prompt",
      // O registro vive em usePwaUpdate: precisamos do `needRefresh` para
      // acender o banner, e nao do script solto que o plugin injetaria no HTML.
      injectRegister: false,
      includeAssets: ["favicon.ico", "apple-touch-icon.png", "masked-icon.svg", "logo.png"],
      workbox: {
        // Acrescenta os listeners de Web Push ao SW gerado pelo Workbox, em vez
        // de registrar um segundo service worker no mesmo escopo — dois SWs
        // brigando pelo controle da pagina quebrariam o `usePwaUpdate`.
        // O arquivo vive em public/, entao sai do build sem hash no nome.
        importScripts: ["push-sw.js"],
      },
      manifest: {
        name: "LBSTTSAPP — LBSTTSAPP",
        short_name: "LBSTTSAPP",
        description: "Tradução de textos, PDFs e fotos com leitura em voz alta neural e navegação por seções.",
        theme_color: "#0f172a",
        background_color: "#0f172a",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        icons: [
          {
            src: "pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    // Em container, `--host` sozinho nao basta: o Vite recusa Host que nao seja
    // localhost e responde "Blocked request". O acesso em dev vem da LAN ou do
    // Tailscale, entao os dois precisam estar ligados.
    host: true,
    allowedHosts: true,
    proxy: {
      "/api": {
        // Em producao o nginx encaminha /api; em dev nao ha nginx. Na maquina o
        // alvo e localhost, em container e o alias do backend na awl_network.
        target: process.env.DEV_API_TARGET || "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
});
