import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL(".", import.meta.url));
const coreRoots = ["domain", "engines", "errors", "lib", "usecases", "validators"];
const forbidden = [
  /from\s+["'](?:react|react-dom|react-router-dom)(?:["']|\/)/,
  /from\s+["'][^"']*\.jsx?["']/,
  /document\./,
  /window\./,
  /\bHTMLElement\b/,
  /\bJSX\b/,
];

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await sourceFiles(path)));
    else if (/\.(js|ts)$/.test(entry.name)) files.push(path);
  }
  return files;
}

describe("core architecture boundary", () => {
  it("keeps the runtime core independent of React, JSX, and DOM globals", async () => {
    const files = (
      await Promise.all(coreRoots.map((directory) => sourceFiles(join(root, directory))))
    ).flat();
    const violations = [];
    for (const file of files) {
      const content = await readFile(file, "utf8");
      for (const rule of forbidden) {
        if (rule.test(content)) violations.push(`${relative(root, file)} matches ${rule}`);
      }
    }
    expect(violations).toEqual([]);
  });
});
