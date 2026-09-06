import { execFile } from "node:child_process";
import { cp, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const ROOT = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const AUDIT = join(ROOT, "scripts", "audit-corpus.mjs");
const SKILLS = join(ROOT, "skills");
const BUNDLE = "code-review";

describe("PR-base corpus tree invariant", () => {
  const roots: string[] = [];

  afterEach(async () => {
    await Promise.all(
      roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
    );
  });

  async function copiedCorpusPair(): Promise<{ baseline: string; current: string }> {
    const baseline = await mkdtemp(join(tmpdir(), "corpus-tree-baseline-"));
    const current = await mkdtemp(join(tmpdir(), "corpus-tree-current-"));
    roots.push(baseline, current);
    await cp(SKILLS, baseline, { recursive: true });
    await cp(SKILLS, current, { recursive: true });
    return { baseline, current };
  }

  async function expectChanged(
    baseline: string,
    current: string,
    relativePath: string,
  ): Promise<void> {
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
    expect(stderr).toContain("existing baseline bundle changed: " + BUNDLE + "/" + relativePath);
  }

  it("rejects an added regular file inside an existing bundle", async () => {
    const { baseline, current } = await copiedCorpusPair();
    await writeFile(join(current, BUNDLE, "added.md"), "new tracked material\n", "utf8");

    await expectChanged(baseline, current, "added.md");
  });

  it("rejects an added symbolic link inside an existing bundle", async () => {
    const { baseline, current } = await copiedCorpusPair();
    await symlink("runtime.md", join(current, BUNDLE, "runtime-link.md"));

    await expectChanged(baseline, current, "runtime-link.md");
  });

  it("rejects a changed symbolic-link target inside an existing bundle", async () => {
    const { baseline, current } = await copiedCorpusPair();
    await symlink("runtime.md", join(baseline, BUNDLE, "tracked-link.md"));
    await symlink("provenance.json", join(current, BUNDLE, "tracked-link.md"));

    await expectChanged(baseline, current, "tracked-link.md");
  });

  it("rejects regular-file to symbolic-link substitution", async () => {
    const { baseline, current } = await copiedCorpusPair();
    await writeFile(join(baseline, BUNDLE, "tracked-entry.md"), "baseline bytes\n", "utf8");
    await symlink("runtime.md", join(current, BUNDLE, "tracked-entry.md"));

    await expectChanged(baseline, current, "tracked-entry.md");
  });
});
