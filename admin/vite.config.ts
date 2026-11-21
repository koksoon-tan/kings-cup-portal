import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks: {
          firebase: ["firebase/app", "firebase/auth", "firebase/firestore", "firebase/storage", "firebase/functions"],
          mantine: ["@mantine/core", "@mantine/hooks", "@mantine/dates", "@mantine/dropzone", "@mantine/notifications", "@mantine/modals"],
        },
      },
    },
  },
});
