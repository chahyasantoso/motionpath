import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

const packagePath = (name, subpath = "") =>
  fileURLToPath(new URL(`./packages/${name}/src/${subpath}`, import.meta.url));

const resolveAliases = {
  "@motionpath/core/": packagePath("core"),
  "@motionpath/react/": packagePath("react", "hooks/"),
};

export default defineConfig({
  plugins: [react()],
  resolve: { alias: resolveAliases },
  test: {
    globals: true,
    alias: resolveAliases,
  },
});
