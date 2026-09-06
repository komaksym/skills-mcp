import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const ROOT = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const AUDIT = join(ROOT, "scripts", "audit-corpus.mjs");

async function run(root: string, baselineRoot?: string) {
  try {
    const result = await execFileAsync(process.execPath, [AUDIT, root], {
      cwd: ROOT,
      env: {
        ...process.env,
        ...(baselineRoot ? { CORPUS_BASELINE_ROOT: baselineRoot } : {}),
      },
    });
    return { code: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    const failed = error as { code?: number; stdout?: string; stderr?: string };
    return {
      code: failed.code ?? 1,
      stdout: failed.stdout ?? "",
      stderr: failed.stderr ?? "",
    };
  }
}

async function bundle(
  root: string,
  name: string,
  options: {
    dependency?: string;
    legacy?: boolean;
    runtime?: string;
    supporting?: boolean;
  } = {},
): Promise<void> {
  const path = join(root, name);
  await mkdir(path, { recursive: true });
  await writeFile(
    join(path, "runtime.md"),
    options.runtime ?? "Generated runtime for " + name + ".\n",
    "utf8",
  );
  await writeFile(join(path, "upstream.md"), "Pinned upstream for " + name + ".\n", "utf8");
  await writeFile(join(path, "LICENSE"), "MIT License\nCopyright (c) Example\n", "utf8");
  if (options.supporting) {
    await writeFile(join(path, "supporting.md"), "Pinned supporting document.\n", "utf8");
  }

  const provenance: Record<string, unknown> = {
    name,
    visibility: "public",
    description: "Fixture.",
    dependencies: options.dependency ? [options.dependency] : [],
    sourceProvenance: {
      type: "pinned-github",
      repository: "https://github.com/example/skills",
      commit: "a".repeat(40),
      license: "MIT",
      attribution: "Copyright (c) Example",
    },
    projection: {
      entrypoint: "upstream.md",
      sources: [
        {
          path: "upstream.md",
          upstreamPath: "skills/" + name + "/SKILL.md",
          sha256: "b".repeat(64),
        },
        ...(options.supporting
          ? [
              {
                path: "supporting.md",
                upstreamPath: "skills/" + name + "/supporting.md",
                sha256: "c".repeat(64),
              },
            ]
          : []),
      ],
      changeRecords: options.supporting
        ? [
            {
              allowedRuntimeChange: "inline-supporting-document",
              source: "supporting.md",
              evidence: {
                targetRuntimeProfile: "chatgpt-web-mcp-v2",
                constraints: ["chatgpt-sandbox"],
                incompatibility: "Fixture supporting document.",
              },
              transform: { type: "append-source", separator: "\n\n" },
            },
          ]
        : [],
    },
  };

  if (options.legacy) {
    provenance.adaptations = ["legacy free-text adaptation"];
  }

  await writeFile(
    join(path, "provenance.json"),
    JSON.stringify(provenance, null, 2) + "\n",
    "utf8",
  );
}

describe("complete Mechanical Projection corpus audit", () => {
  const roots: string[] = [];

  afterEach(async () => {
    await Promise.all(
      roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
    );
  });

  async function temp(): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), "corpus-quality-"));
    roots.push(root);
    return root;
  }

  it("accepts projected bundles and reports runtime sizes without a hard cap", async () => {
    const root = await temp();
    await bundle(root, "alpha", { runtime: "Large generated text. ".repeat(2000) });
    const result = await run(root);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("runtime alpha:");
  });

  it("accepts byte-identical existing bundles against the prepared baseline", async () => {
    const baselineRoot = await temp();
    const root = await temp();
    await bundle(baselineRoot, "alpha");
    await bundle(root, "alpha");

    const result = await run(root, baselineRoot);

    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");
  });

  it("rejects byte changes to an existing baseline bundle", async () => {
    const baselineRoot = await temp();
    const root = await temp();
    await bundle(baselineRoot, "alpha", { runtime: "old\n" });
    await bundle(root, "alpha", { runtime: "expanded\n" });

    const result = await run(root, baselineRoot);

    expect(result.code).toBe(1);
    expect(result.stdout).toContain(
      "runtime alpha: 9 bytes (~3 tokens), +5 bytes vs baseline",
    );
    expect(result.stderr).toContain("existing baseline bundle changed: alpha/runtime.md");
  });

  it("rejects removal of an existing baseline bundle", async () => {
    const baselineRoot = await temp();
    const root = await temp();
    await bundle(baselineRoot, "alpha");

    const result = await run(root, baselineRoot);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("existing baseline bundle removed: alpha");
  });

  it("rejects the retired free-text provenance form", async () => {
    const root = await temp();
    await bundle(root, "legacy", { legacy: true });
    const result = await run(root);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("legacy free-text provenance is forbidden");
  });

  it("rejects unresolved pinned Supporting Document references", async () => {
    const root = await temp();
    await bundle(root, "alpha", {
      supporting: true,
      runtime: "Read [supporting](supporting.md).\n",
    });
    const result = await run(root);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("unresolved Supporting Document reference");
  });

  it("rejects undeclared local Supporting Document references", async () => {
    const root = await temp();
    await bundle(root, "alpha", {
      runtime: "Read [guide](missing.md).\n",
    });
    const result = await run(root);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain(
      "unresolved Supporting Document reference: missing.md",
    );
  });

  it("allows target-repository domain document references", async () => {
    const root = await temp();
    await bundle(root, "alpha", {
      runtime: "Read [context](./src/ordering/CONTEXT.md).\n",
    });
    const result = await run(root);
    expect(result.code).toBe(0);
  });

  it("rejects embedded Dependency Skill runtimes", async () => {
    const root = await temp();
    await bundle(root, "child", { runtime: "CHILD UNIQUE RUNTIME\n" });
    await bundle(root, "parent", {
      dependency: "child",
      runtime: "Parent intro.\n\nCHILD UNIQUE RUNTIME\n",
    });
    const result = await run(root);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("embeds Dependency Skill runtime child");
  });

  it("rejects materially copied Dependency Skill text with a small adaptation", async () => {
    const root = await temp();
    const dependencyWords = Array.from(
      { length: 80 },
      (_, index) => "dependencyword" + index,
    );
    await bundle(root, "child", {
      runtime: dependencyWords.join(" ") + "\n",
    });
    const copied = dependencyWords.slice(10, 60);
    copied[20] = "locally-adapted-word";

    await bundle(root, "parent", {
      dependency: "child",
      runtime: "Parent intro.\n\n" + copied.join(" ") + "\n",
    });

    const result = await run(root);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("embeds Dependency Skill runtime child");
  });

  it("rejects a duplicated Runtime Envelope", async () => {
    const root = await temp();
    await bundle(root, "alpha", {
      runtime: "# Remote execution contract\nextra\n",
    });
    const result = await run(root);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("Generated Runtime embeds the Runtime Envelope");
  });

  it("rejects large repeated boilerplate without imposing a runtime size cap", async () => {
    const root = await temp();
    const repeated = "Repeated structural boilerplate ".repeat(20);
    await bundle(root, "alpha", {
      runtime: "Intro\n\n" + repeated + "\n\nBody\n\n" + repeated + "\n",
    });
    const result = await run(root);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("repeats a large boilerplate block");
  });
});
