import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

const coreSrc = fileURLToPath(new URL("./packages/core/src", import.meta.url));
const reactHooks = fileURLToPath(new URL("./packages/react/src/hooks", import.meta.url));

const resolveAliases = [
  { find: /^@motionpath\/core\/(.*)$/, replacement: `${coreSrc}/$1` },
  { find: /^@motionpath\/react\/(.*)$/, replacement: `${reactHooks}/$1` },
];

export default defineConfig({
  plugins: [react()],
  resolve: { alias: resolveAliases },
  test: { globals: true, alias: resolveAliases },
});
