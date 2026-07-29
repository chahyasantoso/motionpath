import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL(".", import.meta.url));
const legacyCoreRoots = ["domain", "engines", "errors", "lib", "usecases", "validators"];
const packageCoreRoot = join(root, "..", "packages", "core", "src");
const forbidden = [
  /from\s+["'](?:react|react-dom|react-router-dom)(?:["']|\/)/,
  /from\s+["'][^"']+\.jsx["']/,
];

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await sourceFiles(path)));
    else if (/\.(js|ts)$/.test(entry.name) && !path.includes(`${join("__tests__", "")}`)) files.push(path);
  }
  return files;
}

async function existingFiles(directory) {
  try { return await sourceFiles(directory); } catch { return []; }
}

describe("core architecture boundary", () => {
  it("keeps legacy and extracted runtime roots independent of React and JSX", async () => {
    const roots = [
      ...legacyCoreRoots.map((directory) => join(root, directory)),
      packageCoreRoot,
    ];
    const files = (await Promise.all(roots.map(existingFiles))).flat();
    const violations = [];
    for (const file of files) {
      const content = await readFile(file, "utf8");
      for (const rule of forbidden) if (rule.test(content)) violations.push(`${relative(root, file)} matches ${rule}`);
    }
    expect(violations).toEqual([]);
  });
});
