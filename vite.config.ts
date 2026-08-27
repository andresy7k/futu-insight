import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";

export default defineConfig({
  server: {
    port: 8080,
    host: "::",
  },
  plugins: [
    tsconfigPaths(),
    tailwindcss(),
    tanstackStart({
      customViteReactPlugin: true,
      srcDirectory: "src",
ދ    }),
    nitro(),
    react(),
  ],
});
