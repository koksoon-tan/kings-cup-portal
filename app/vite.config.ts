import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { fileURLToPath } from "url";

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
// Demo mode reuses the admin dashboard's in-browser Firebase stand-ins (and the real functions code).
const d = (f: string) => here(`../admin/src/demo/${f}`);
const demoAliases = [
  { find: /^@demo$/, replacement: here("./src/demo/DemoGate.tsx") },
  { find: /^firebase\/app$/, replacement: d("client-app.ts") },
  { find: /^firebase\/auth$/, replacement: d("client-auth.ts") },
  { find: /^firebase\/firestore$/, replacement: d("client-firestore.ts") },
  { find: /^firebase\/storage$/, replacement: d("client-storage.ts") },
  { find: /^firebase\/functions$/, replacement: d("client-functions.ts") },
  { find: /^firebase-admin\/app$/, replacement: d("admin-app.ts") },
  { find: /^firebase-admin\/firestore$/, replacement: d("admin-firestore.ts") },
  { find: /^firebase-admin\/auth$/, replacement: d("admin-auth.ts") },
  { find: /^firebase-admin\/storage$/, replacement: d("admin-storage.ts") },
  { find: /^firebase-functions\/v2\/https$/, replacement: d("ff-https.ts") },
  { find: /^firebase-functions\/v2\/firestore$/, replacement: d("ff-firestore.ts") },
  { find: /^firebase-functions\/v2\/storage$/, replacement: d("ff-storage.ts") },
  { find: /^firebase-functions\/v2\/scheduler$/, replacement: d("ff-scheduler.ts") },
  { find: /^firebase-functions$/, replacement: d("ff-root.ts") },
  { find: /^crypto$/, replacement: d("crypto-shim.ts") },
  { find: /^sharp$/, replacement: d("sharp-shim.ts") },
  { find: /^pdfkit$/, replacement: here("../functions/node_modules/pdfkit/js/pdfkit.standalone.js") },
  { find: /^jszip$/, replacement: here("./node_modules/jszip/dist/jszip.min.js") },
  { find: /^buffer$/, replacement: here("./node_modules/buffer/index.js") },
];

export default defineConfig(({ mode }) => {
  const demo = mode === "demo";
  return {
    plugins: [
      react(),
      // Installable app + offline app shell. Deck art is cached separately (IndexedDB) when a deck is opened.
      !demo && VitePWA({
        registerType: "autoUpdate",
        includeAssets: ["icon.svg"],
        manifest: {
          name: "Kings Cup",
          short_name: "Kings Cup",
          description: "The big top party card game",
          theme_color: "#15122b",
          background_color: "#15122b",
          display: "standalone",
          orientation: "any",
          icons: [
            { src: "icon-192.png", sizes: "192x192", type: "image/png" },
            { src: "icon-512.png", sizes: "512x512", type: "image/png" },
            { src: "icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
          ],
        },
        workbox: { globPatterns: ["**/*.{js,css,html,woff2,png,svg}"], navigateFallback: "/index.html" },
      }),
    ],
    base: demo ? "./" : "/",
    resolve: { alias: demo ? demoAliases : [{ find: /^@demo$/, replacement: here("./src/demo/stub.tsx") }] },
    server: { fs: { allow: [here("..")] } },
    build: { outDir: demo ? "dist-demo" : "dist", chunkSizeWarningLimit: 3000 },
    test: { environment: "node", include: ["src/**/*.test.ts"] },
  };
});
