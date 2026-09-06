import { execFile } from "node:child_process";
import { cp, mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const ROOT = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const AUDIT = join(ROOT, "scripts", "audit-corpus.mjs");
const SKILLS = join(ROOT, "skills");

describe("PR-base corpus tree invariant", () => {
  const roots: string[] = [];

  afterEach(async () => {
    await Promise.all(
      roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
    );
  });

  it("rejects an added symbolic link inside an existing bundle", async () => {
    const baseline = await mkdtemp(join(tmpdir(), "corpus-symlink-baseline-"));
    const current = await mkdtemp(join(tmpdir(), "corpus-symlink-current-"));
    roots.push(baseline, current);
    await cp(SKILLS, baseline, { recursive: true });
    await cp(SKILLS, current, { recursive: true });
    await symlink("runtime.md", join(current, "code-review", "runtime-link.md"));

    let code = 0;
    let stderr = "";
    try {
      await execFileAsync(process.execPath, [AUDIT, current], {
        cwd: ROOT,
        env: { ...process.env, CORPUS_BASELINE_ROOT: baseline },
      });
    } catch (error) {
      const failed = error as { code?: number; stderr?: string };
      code = failed.code ?? 1;
      stderr = failed.stderr ?? "";
    }

    expect(code).toBe(1);
    expect(stderr).toContain("existing baseline bundle changed: code-review/runtime-link.md");
  });
});
