import { existsSync } from "node:fs";
import {
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { dirname, join } from "node:path";

const root = process.cwd();
const moves = [
  ["src/components", "apps/demo/src/components"],
  ["src/App.jsx", "apps/demo/src/App.jsx"],
  ["src/App.css", "apps/demo/src/App.css"],
  ["src/main.jsx", "apps/demo/src/main.jsx"],
  ["src/hooks", "packages/react/src/hooks"],
];
const extensions = new Set([".js", ".jsx", ".ts", ".tsx", ".css"]);
const existingTargetIsMigrationDestination = new Set([
  "apps/demo/src/App.jsx",
  "apps/demo/src/App.css",
  "apps/demo/src/main.jsx",
]);
const absolute = (path) => join(root, path);
const normalized = (text) =>
  text.replaceAll("\r\n", "\n").replaceAll("\r", "\n");

async function isScaffoldBridge(path) {
  if (!existsSync(path)) return false;
  const text = await readFile(path, "utf8");
  return (
    /export\s+\{\s*default\s*\}\s+from\s+["']\.\.\/.+["'];?/.test(text) ||
    /^@import\s+url\(["']\.\.\/.+["']\);?\s*$/m.test(text)
  );
}

async function moveFile(source, target) {
  const from = absolute(source);
  const to = absolute(target);
  if (!existsSync(from)) return "skipped";
  await mkdir(dirname(to), { recursive: true });
  if (existsSync(to)) {
    const sourceText = await readFile(from, "utf8");
    const targetText = await readFile(to, "utf8");
    if (normalized(sourceText) === normalized(targetText)) {
      await rm(from);
      return "deduplicated";
    }
    if (await isScaffoldBridge(to)) {
      await rm(to);
    } else if (existingTargetIsMigrationDestination.has(target)) {
      // PR #47 may have already materialized the destination. Keep the app
      // copy as canonical and remove only the legacy duplicate.
      await rm(from);
      return "kept-destination";
    } else {
      throw new Error(`Refusing to overwrite non-scaffold file ${target}`);
    }
  }
  await rename(from, to);
  return "moved";
}

async function moveTree(source, target) {
  const from = absolute(source);
  if (!existsSync(from)) return { moved: 0, skipped: 1 };
  const entries = await readdir(from, { withFileTypes: true });
  let moved = 0;
  for (const entry of entries) {
    const childSource = `${source}/${entry.name}`;
    const childTarget = `${target}/${entry.name}`;
    if (entry.isDirectory())
      moved += (await moveTree(childSource, childTarget)).moved;
    else if ((await moveFile(childSource, childTarget)) === "moved") moved += 1;
  }
  if (existsSync(from)) await rm(from, { recursive: true, force: true });
  return { moved, skipped: 0 };
}

async function moveEntry(source, target) {
  const from = absolute(source);
  if (!existsSync(from)) return { moved: 0, skipped: 1 };
  if ((await stat(from)).isDirectory()) return moveTree(source, target);
  return {
    moved: (await moveFile(source, target)) === "moved" ? 1 : 0,
    skipped: 0,
  };
}

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(path)));
    else if (extensions.has(path.slice(path.lastIndexOf("."))))
      files.push(path);
  }
  return files;
}

function rewriteImports(content) {
  return content
    .replaceAll(
      /from ["'](?:\.\.\/)+hooks\/(use[^"']+)["']/g,
      'from "@motionpath/react/$1"',
    )
    .replaceAll(
      /from ["'](?:\.\.\/)+engines\/Engine\.js["']/g,
      'from "@motionpath/core/engines/Engine"',
    )
    .replaceAll(
      /from ["'](?:\.\.\/)+domain\/([^"']+)["']/g,
      'from "@motionpath/core/$1"',
    )
    .replaceAll(
      /from ["'](?:\.\.\/)+lib\/([^"']+)["']/g,
      'from "@motionpath/core/$1"',
    )
    .replaceAll(
      /from ["'](?:\.\.\/)+usecases\/([^"']+)["']/g,
      'from "@motionpath/core/$1"',
    );
}

let moved = 0;
for (const [source, target] of moves)
  moved += (await moveEntry(source, target)).moved;
for (const base of ["apps/demo/src", "packages/react/src"]) {
  const directory = absolute(base);
  if (!existsSync(directory)) continue;
  for (const file of await walk(directory))
    await writeFile(file, rewriteImports(await readFile(file, "utf8")));
}
console.log(
  `Moved ${moved} files. Safe to rerun: identical files deduplicate, app destinations win, bridges are replaced, and real conflicts remain protected.`,
);
