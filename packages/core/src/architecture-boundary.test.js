import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL(".", import.meta.url));
const forbidden = [/from\s+["'](?:react|react-dom|react-router-dom)(?:["']|\/)/, /from\s+["'][^"']+\.jsx["']/];

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

describe("extracted core boundary", () => {
  it("contains no React or JSX imports", async () => {
    const violations = [];
    for (const file of await sourceFiles(root)) {
      const content = await readFile(file, "utf8");
      for (const rule of forbidden) if (rule.test(content)) violations.push(file);
    }
    expect(violations).toEqual([]);
  });
});
