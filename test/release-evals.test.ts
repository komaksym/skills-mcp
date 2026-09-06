import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  ADAPTER_PIN,
  ADAPTER_REPOSITORY,
  RELEASE_ROOT,
  UPSTREAM_PIN,
  WORKFLOW_PIN,
  WORKFLOW_REPOSITORY,
  type SourceReference,
  completedReleaseRun,
  loadReleaseSuite,
  validateReleaseRun,
} from "./release-evals-support.js";

describe("manual faithful-workflow release evaluations", () => {
  it("defines one paired case and four focused observation cases", async () => {
    const data = await loadReleaseSuite();
    expect(data.version).toBe(4);
    expect(data.mode).toBe("manual-release-only");
    expect(data.cases).toHaveLength(5);
    expect(data.cases.filter((item) => item.mode === "paired")).toHaveLength(1);
    expect(data.cases.filter((item) => item.mode === "observation")).toHaveLength(4);

    for (const item of data.cases) {
      expect(item.model).toBe("GPT-5.6 Sol");
      expect(item.task.trim()).not.toBe("");
      expect(item.repositoryContext.reset.trim()).not.toBe("");
      expect(item.capabilities.length).toBeGreaterThan(0);
      expect(item.prompt.trim()).not.toBe("");
      expect(item.rubric.length).toBeGreaterThan(0);
      if (item.workflow !== "adapt-codex-skill") {
        expect(item.repositoryContext).toMatchObject({
          sourceRepository: WORKFLOW_REPOSITORY,
          baseSha: WORKFLOW_PIN,
        });
      }
    }

    const missingAdapter = data.cases.find(
      (item) => item.id === "adapt-codex-skill-missing-supporting-document",
    );
    expect(missingAdapter?.repositoryContext).toMatchObject({
      sourceRepository: ADAPTER_REPOSITORY,
      baseSha: ADAPTER_PIN,
    });
  });

  it("derives every rubric from a pinned behavioral source plus the adaptation contract", async () => {
    const data = await loadReleaseSuite();

    for (const item of data.cases) {
      for (const criterion of item.rubric) {
        const sourceReferences = [criterion.source.upstream, criterion.source.adapter].filter(
          (reference): reference is SourceReference => reference !== undefined,
        );
        expect(sourceReferences).toHaveLength(1);

        if (criterion.source.upstream) {
          expect(criterion.source.upstream.commit).toBe(UPSTREAM_PIN);
          expect(criterion.source.upstream.path).toMatch(/\/SKILL\.md$/);
          expect(criterion.source.upstream.path).not.toContain("runtime.md");
          expect(criterion.source.upstream.section.trim()).not.toBe("");
        } else {
          expect(criterion.source.adapter?.commit).toBe(ADAPTER_PIN);
          expect(criterion.source.adapter?.path).toBe("docs/adapt-codex-skill.md");
          expect(["Inspect", "Adapt", "Output"]).toContain(criterion.source.adapter?.section);
        }
        expect(criterion.source.contract.issue).toBe(1);
        expect(criterion.source.contract.userStory).toBeGreaterThan(0);
      }
    }
  });

  it("covers the agreed high-risk release outcomes", async () => {
    const data = await loadReleaseSuite();
    const rubricIds = data.cases.flatMap((item) => item.rubric.map((criterion) => criterion.id));

    expect(rubricIds).toEqual(
      expect.arrayContaining([
        "ready-for-agent",
        "independent-workers-parallel",
        "stop-instead-degrade",
        "missing-supporting-document-named",
        "stop-before-adaptation-spec",
        "inspects-current-target-environment",
        "preserves-unforced-methodology",
        "maps-required-runtime-seams",
        "preserves-helper-and-dependency-boundary",
        "records-absent-source-provenance",
        "emits-complete-adaptation-spec",
      ]),
    );
    expect(data.cases.find((item) => item.workflow === "to-spec")?.mode).toBe("paired");
    expect(data.cases.filter((item) => item.workflow === "code-review")).toHaveLength(2);
    expect(data.cases.filter((item) => item.workflow === "adapt-codex-skill")).toHaveLength(2);
  });

  it("keeps workflow answers and forbidden product changes out of evaluation inputs", async () => {
    const data = await loadReleaseSuite();
    const toSpec = data.cases.find((item) => item.workflow === "to-spec");
    const adapterSuccess = data.cases.find(
      (item) => item.id === "adapt-codex-skill-representative-success",
    );

    expect(toSpec?.task + "\n" + toSpec?.prompt).not.toMatch(
      /includeHidden|ask and wait|requires confirmation/i,
    );
    expect(adapterSuccess?.prompt).not.toContain("adaptation-spec.md");
    expect(adapterSuccess?.prompt).toContain("No expected-output Adaptation Spec exists");
  });

  it("marks criteria that require observed external state", async () => {
    const data = await loadReleaseSuite();
    const required = data.cases.flatMap((item) =>
      item.rubric
        .filter((criterion) => criterion.requiresExternalEvidence)
        .map((criterion) => item.workflow + ":" + criterion.id),
    );

    expect(required).toEqual(
      expect.arrayContaining([
        "to-spec:ready-for-agent",
        "to-spec:observed-publication",
        "code-review:independent-workers-parallel",
        "code-review:stop-instead-degrade",
        "adapt-codex-skill:inspects-current-target-environment",
      ]),
    );
  });

  it("records outputs, target reads, external results, judgments, and rationale", async () => {
    const template = JSON.parse(
      await readFile(new URL("run-template.json", RELEASE_ROOT), "utf8"),
    ) as Record<string, unknown>;

    expect(template).toMatchObject({
      mode: "manual-release",
      runId: "",
      releaseSha: "",
      cases: [
        {
          caseId: "",
          mode: "paired",
          task: "",
          prompt: "",
          followUp: null,
          baseline: {
            skill: null,
            model: "",
            skillsMcp: { repository: "", releaseSha: "", evidence: "" },
            adapter: null,
            repository: { url: "", sourceRepository: "", baseSha: "" },
            targetEnvironment: [],
            capabilities: [],
            output: "",
            externalResults: [],
            rubric: [],
            pass: null,
            rationale: "",
          },
          adapted: {
            skill: "",
            model: "",
            skillsMcp: { repository: "", releaseSha: "", evidence: "" },
            adapter: null,
            repository: { url: "", sourceRepository: "", baseSha: "" },
            targetEnvironment: [],
            capabilities: [],
            output: "",
            externalResults: [],
            rubric: [],
            pass: null,
            rationale: "",
          },
          pass: null,
          rationale: "",
          comparison: "",
        },
      ],
    });
  });

  it("rejects passing externally observed criteria without external results", async () => {
    const data = await loadReleaseSuite();
    const run = completedReleaseRun(data) as {
      cases: Array<{ caseId: string; adapted: { externalResults: unknown[] } }>;
    };
    const toSpec = run.cases.find((item) => item.caseId === "representative-to-spec");
    if (!toSpec) throw new Error("expected to-spec evaluation case");
    toSpec.adapted.externalResults = [];

    const rejected = await validateReleaseRun(run);
    expect(rejected.status).toBe(1);
    expect(rejected.stderr).toContain("externalResults");
  });

  it("rejects a variant whose recorded Skills MCP revision differs from the release", async () => {
    const data = await loadReleaseSuite();
    const run = completedReleaseRun(data) as {
      cases: Array<{
        caseId: string;
        adapted: { skillsMcp: { releaseSha: string } | null };
      }>;
    };
    const toSpec = run.cases.find((item) => item.caseId === "representative-to-spec");
    if (!toSpec?.adapted.skillsMcp) throw new Error("expected Skills MCP evaluation case");
    toSpec.adapted.skillsMcp.releaseSha = "b".repeat(40);

    const rejected = await validateReleaseRun(run);
    expect(rejected.status).toBe(1);
    expect(rejected.stderr).toContain("Skills MCP release SHA");
  });

  it("validates completed paired and observation records through the CLI boundary", async () => {
    const data = await loadReleaseSuite();
    const run = completedReleaseRun(data);

    const valid = await validateReleaseRun(run);
    expect(valid.status).toBe(0);
    expect(valid.stdout).toContain("Validated 5 manual release evaluations.");

    const invalid = run as { cases: Array<{ adapted: { capabilities: string[] } }> };
    const firstCase = invalid.cases[0];
    if (!firstCase) throw new Error("expected at least one evaluation case");
    firstCase.adapted.capabilities = ["different capability"];

    const rejected = await validateReleaseRun(invalid);
    expect(rejected.status).toBe(1);
    expect(rejected.stderr).toContain(
      "capabilities must exactly match the fixed case capabilities",
    );
  });

  it("rejects a baseline record for an observation case", async () => {
    const data = await loadReleaseSuite();
    const run = completedReleaseRun(data) as {
      cases: Array<{ caseId: string; baseline: unknown }>;
    };
    const observation = run.cases.find(
      (item) => item.caseId === "code-review-independent-workers",
    );
    if (!observation) throw new Error("expected independent-worker observation case");
    observation.baseline = {};

    const rejected = await validateReleaseRun(run);
    expect(rejected.status).toBe(1);
    expect(rejected.stderr).toContain("baseline must be null for an observation case");
  });

  it("documents a manual release step without stochastic model calls in CI", async () => {
    const guide = await readFile(new URL("README.md", RELEASE_ROOT), "utf8");

    expect(guide).toContain("manual/release only");
    expect(guide).toContain("same model receives the same task");
    expect(guide).toContain("pinned behavioral source");
    expect(guide).toMatch(/Skill Adaptation\s+Contract/);
    expect(guide).toContain("failed or unavailable Live Capability");
    expect(guide).toContain("node evals/release/validate-run.mjs");
    expect(guide).toContain("must not call a model");
    expect(guide).toMatch(/recorded\s+`releaseSha`/);
    expect(guide).toContain("observed Skills MCP revision");
    expect(guide).toContain("do **not** pretend the adapter is an");
  });
});
