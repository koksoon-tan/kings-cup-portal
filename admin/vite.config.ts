import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "url";

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const d = (f: string) => here(`./src/demo/${f}`);

// `vite --mode demo` / `vite build --mode demo` runs the whole system in the browser:
// Firebase SDKs are swapped for in-memory stand-ins and functions/src is bundled in.
const demoAliases = [
  { find: /^@demo$/, replacement: d("DemoUI.tsx") },
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
];

export default defineConfig(({ mode }) => {
  const demo = mode === "demo";
  return {
    plugins: [react()],
    base: demo ? "./" : "/",
    resolve: { alias: demo ? demoAliases : [{ find: /^@demo$/, replacement: d("stub.tsx") }] },
    server: { fs: { allow: [here("..")] } },
    build: {
      outDir: demo ? "dist-demo" : "dist",
      chunkSizeWarningLimit: 3000,
      rollupOptions: demo ? {} : {
        output: {
          manualChunks: {
            firebase: ["firebase/app", "firebase/auth", "firebase/firestore", "firebase/storage", "firebase/functions"],
            mantine: ["@mantine/core", "@mantine/hooks", "@mantine/dates", "@mantine/dropzone", "@mantine/notifications", "@mantine/modals"],
          },
        },
      },
    },
  };
});
