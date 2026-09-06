import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const ROOT = new URL("../evals/release/", import.meta.url);
const WORKFLOW_REPOSITORY = "komaksym/chatgpt-chat-skills-mcp";
const WORKFLOW_PIN = "de37f7c16bb2ec229f13d3edbde8cdcb3dcfe246";
const ADAPTER_REPOSITORY = "komaksym/skills-mcp";
const ADAPTER_PIN = "976f7cd0ec7236a1e2375f00ad59c2ba5b063fcf";

interface EvaluationCase {
  id: string;
  mode: "paired" | "observation";
  workflow: string;
  model: string;
  task: string;
  prompt: string;
  followUp?: string;
  repositoryContext: {
    sourceRepository: string;
    baseSha: string;
    writes: boolean;
    reset: string;
  };
  capabilities: string[];
  rubric: Array<{
    id: string;
    requiresExternalEvidence?: boolean;
    source: {
      adapter?: { commit: string; path: string; section: string };
    };
  }>;
}

interface Suite {
  cases: EvaluationCase[];
}

async function suite(): Promise<Suite> {
  return JSON.parse(await readFile(new URL("cases.json", ROOT), "utf8")) as Suite;
}

function completedRun(data: Suite): Record<string, unknown> {
  const releaseSha = "a".repeat(40);
  return {
    mode: "manual-release",
    runId: "hardening-test-run",
    releaseSha,
    cases: data.cases.map((item, index) => {
      const isAdapter = item.workflow === "adapt-codex-skill";
      const rubric = item.rubric.map((criterion) => ({
        id: criterion.id,
        judgment: "pass",
        evidence: "Observed fixture evidence.",
      }));
      const externalResults = item.rubric.some((criterion) => criterion.requiresExternalEvidence)
        ? ["Observed external fixture result."]
        : [];
      const repository = {
        url: `https://example.test/repository-${index}`,
        sourceRepository: item.repositoryContext.sourceRepository,
        baseSha: item.repositoryContext.baseSha,
      };
      const evidence = isAdapter
        ? {
            skillsMcp: null,
            adapter: {
              repository: ADAPTER_REPOSITORY,
              commit: ADAPTER_PIN,
              path: "docs/adapt-codex-skill.md",
              evidence: "Observed the exact pinned adapter document before the run.",
            },
          }
        : {
            skillsMcp: {
              repository: WORKFLOW_REPOSITORY,
              releaseSha,
              evidence: "Observed fixture service revision.",
            },
            adapter: null,
          };
      const variant = (skill: string | null, suffix: string) => ({
        skill,
        model: item.model,
        ...evidence,
        repository: { ...repository, url: `${repository.url}-${suffix}` },
        capabilities: item.capabilities,
        output: "Observed output.",
        externalResults: [...externalResults],
        rubric: rubric.map((entry) => ({ ...entry })),
        pass: true,
        rationale: "Observed condition passed.",
      });

      return {
        caseId: item.id,
        mode: item.mode,
        task: item.task,
        prompt: item.prompt,
        followUp: item.followUp ?? null,
        baseline: item.mode === "paired" ? variant(null, "baseline") : null,
        adapted: variant(item.workflow, "adapted"),
        pass: true,
        rationale: "All fixed criteria passed.",
        comparison: item.mode === "paired" ? "Observed behavioral delta." : "Direct observation.",
      };
    }),
  };
}

describe("release evaluation hardening", () => {
  it("defines both adapter failure and successful-adaptation observations", async () => {
    const data = await suite();
    const adapterCases = data.cases.filter((item) => item.workflow === "adapt-codex-skill");

    expect(data.cases).toHaveLength(5);
    expect(adapterCases.map((item) => item.id)).toEqual([
      "adapt-codex-skill-missing-supporting-document",
      "adapt-codex-skill-representative-success",
    ]);
    expect(
      adapterCases
        .find((item) => item.id === "adapt-codex-skill-representative-success")
        ?.rubric.map((criterion) => criterion.id),
    ).toEqual(
      expect.arrayContaining([
        "preserves-unforced-methodology",
        "maps-required-runtime-seams",
        "preserves-helper-and-dependency-boundary",
        "records-absent-source-provenance",
        "emits-complete-adaptation-spec",
      ]),
    );
  });

  it("pins repository context by case type", async () => {
    const data = await suite();

    for (const item of data.cases) {
      if (item.workflow === "adapt-codex-skill") {
        expect(item.repositoryContext).toMatchObject({
          sourceRepository: ADAPTER_REPOSITORY,
          baseSha: ADAPTER_PIN,
        });
      } else {
        expect(item.repositoryContext).toMatchObject({
          sourceRepository: WORKFLOW_REPOSITORY,
          baseSha: WORKFLOW_PIN,
        });
      }
    }
  });

  it("uses adapter behavioral sections for the successful observation", async () => {
    const data = await suite();
    const success = data.cases.find((item) => item.id === "adapt-codex-skill-representative-success");
    if (!success) throw new Error("expected successful adapter observation");

    expect(success.rubric.map((criterion) => criterion.source.adapter?.section)).toEqual(
      expect.arrayContaining(["Adapt", "Output"]),
    );
  });

  it("validates adapter evidence independently from Skills MCP evidence", async () => {
    const data = await suite();
    const directory = await mkdtemp(join(tmpdir(), "release-evals-hardening-"));
    const runPath = join(directory, "run.json");
    const validatorPath = fileURLToPath(new URL("validate-run.mjs", ROOT));

    try {
      const run = completedRun(data);
      await writeFile(runPath, JSON.stringify(run), "utf8");
      const valid = spawnSync(process.execPath, [validatorPath, runPath], { encoding: "utf8" });
      expect(valid.status).toBe(0);
      expect(valid.stdout).toContain("Validated 5 manual release evaluations.");

      const invalid = run as {
        cases: Array<{
          caseId: string;
          adapted: {
            skillsMcp: unknown;
            adapter: unknown;
          };
        }>;
      };
      const adapterCase = invalid.cases.find(
        (item) => item.caseId === "adapt-codex-skill-representative-success",
      );
      if (!adapterCase) throw new Error("expected adapter evaluation case");
      adapterCase.adapted.adapter = null;
      adapterCase.adapted.skillsMcp = {
        repository: WORKFLOW_REPOSITORY,
        releaseSha: "a".repeat(40),
        evidence: "Wrong evidence source.",
      };
      await writeFile(runPath, JSON.stringify(invalid), "utf8");

      const rejected = spawnSync(process.execPath, [validatorPath, runPath], { encoding: "utf8" });
      expect(rejected.status).toBe(1);
      expect(rejected.stderr).toContain("adapter evidence");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("rejects a paired case that claims PASS when its baseline failed", async () => {
    const data = await suite();
    const directory = await mkdtemp(join(tmpdir(), "release-evals-hardening-"));
    const runPath = join(directory, "run.json");
    const validatorPath = fileURLToPath(new URL("validate-run.mjs", ROOT));

    try {
      const run = completedRun(data) as {
        cases: Array<{
          caseId: string;
          baseline: null | {
            pass: boolean;
            rubric: Array<{ judgment: "pass" | "fail" | "not-observed" }>;
          };
          pass: boolean;
        }>;
      };
      const paired = run.cases.find((item) => item.caseId === "representative-to-spec");
      if (!paired?.baseline) throw new Error("expected paired evaluation case");
      paired.baseline.rubric[0]!.judgment = "fail";
      paired.baseline.pass = false;
      paired.pass = true;
      await writeFile(runPath, JSON.stringify(run), "utf8");

      const rejected = spawnSync(process.execPath, [validatorPath, runPath], { encoding: "utf8" });
      expect(rejected.status).toBe(1);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("rejects completed release gates containing fail or not-observed required cases", async () => {
    const data = await suite();
    const validatorPath = fileURLToPath(new URL("validate-run.mjs", ROOT));

    for (const judgment of ["fail", "not-observed"] as const) {
      const directory = await mkdtemp(join(tmpdir(), "release-evals-hardening-"));
      const runPath = join(directory, "run.json");
      try {
        const run = completedRun(data) as {
          cases: Array<{
            caseId: string;
            adapted: {
              pass: boolean;
              rubric: Array<{ judgment: "pass" | "fail" | "not-observed" }>;
            };
            pass: boolean;
          }>;
        };
        const observation = run.cases.find(
          (item) => item.caseId === "adapt-codex-skill-representative-success",
        );
        if (!observation) throw new Error("expected successful adapter observation");
        observation.adapted.rubric[0]!.judgment = judgment;
        observation.adapted.pass = false;
        observation.pass = false;
        await writeFile(runPath, JSON.stringify(run), "utf8");

        const rejected = spawnSync(process.execPath, [validatorPath, runPath], { encoding: "utf8" });
        expect(rejected.status).toBe(1);
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    }
  });

  it("keeps release proof incomplete until the five-case manual record exists", async () => {
    const proof = await readFile(new URL("../docs/release-proof.md", import.meta.url), "utf8");

    expect(proof).toContain("Status: NOT EXERCISED");
    expect(proof).toMatch(/Targeted manual release evaluations:\s+`NOT EXERCISED`/);
  });
});
