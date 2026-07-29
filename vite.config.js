import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@motionpath/core": fileURLToPath(new URL("./packages/core/src", import.meta.url)),
      "@motionpath/react": fileURLToPath(new URL("./packages/react/src", import.meta.url)),
    },
  },
  test: {
    globals: true,
    alias: {
      "@motionpath/core": fileURLToPath(new URL("./packages/core/src", import.meta.url)),
      "@motionpath/react": fileURLToPath(new URL("./packages/react/src", import.meta.url)),
    },
  },
});
