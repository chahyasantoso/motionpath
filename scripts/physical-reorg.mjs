import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";

const root = process.cwd();
const moves = [
  ["src/components", "apps/demo/src/components"],
  ["src/App.jsx", "apps/demo/src/App.jsx"],
  ["src/App.css", "apps/demo/src/App.css"],
  ["src/main.jsx", "apps/demo/src/main.jsx"],
  ["src/hooks", "packages/react/src/hooks"],
];
const extensions = new Set([".js", ".jsx", ".ts", ".tsx", ".css"]);

async function move(source, target) {
  const from = join(root, source);
  const to = join(root, target);
  if (!existsSync(from)) return;
  await mkdir(dirname(to), { recursive: true });
  if (existsSync(to)) throw new Error(`Refusing to overwrite ${target}`);
  await rename(from, to);
}

async function walk(directory) {
  const entries = await (await import("node:fs/promises")).readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path));
    else if (extensions.has(path.slice(path.lastIndexOf(".")))) files.push(path);
  }
  return files;
}

function rewriteImports(content) {
  return content
    .replaceAll(/from ["'](?:\.\.\/)+hooks\/(use[^"']+)["']/g, 'from "@motionpath/react/$1"')
    .replaceAll(/from ["'](?:\.\.\/)+engines\/Engine\.js["']/g, 'from "@motionpath/core/engines/Engine"')
    .replaceAll(/from ["'](?:\.\.\/)+domain\/([^"']+)["']/g, 'from "@motionpath/core/$1"')
    .replaceAll(/from ["'](?:\.\.\/)+lib\/([^"']+)["']/g, 'from "@motionpath/core/$1"')
    .replaceAll(/from ["'](?:\.\.\/)+usecases\/([^"']+)["']/g, 'from "@motionpath/core/$1"');
}

for (const [source, target] of moves) await move(source, target);
for (const base of ["apps/demo/src", "packages/react/src"]) {
  const directory = join(root, base);
  if (!existsSync(directory)) continue;
  for (const file of await walk(directory)) {
    const next = rewriteImports(await readFile(file, "utf8"));
    await writeFile(file, next);
  }
}
console.log(`Moved ${moves.length} legacy roots into packages/core, packages/react, and apps/demo.`);
