import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  ADAPTER_PIN,
  ADAPTER_REPOSITORY,
  WORKFLOW_PIN,
  WORKFLOW_REPOSITORY,
  completedReleaseRun,
  loadReleaseSuite,
  validateReleaseRun,
} from "./release-evals-support.js";

describe("release evaluation hardening", () => {
  it("defines both adapter failure and successful-adaptation observations", async () => {
    const data = await loadReleaseSuite();
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
        "inspects-current-target-environment",
        "preserves-unforced-methodology",
        "maps-required-runtime-seams",
        "preserves-helper-and-dependency-boundary",
        "records-absent-source-provenance",
        "emits-complete-adaptation-spec",
      ]),
    );
  });

  it("pins adapter cases to an oracle-free source tree", async () => {
    const data = await loadReleaseSuite();

    for (const item of data.cases) {
      if (item.workflow !== "adapt-codex-skill") {
        expect(item.repositoryContext).toMatchObject({
          sourceRepository: WORKFLOW_REPOSITORY,
          baseSha: WORKFLOW_PIN,
        });
      }
    }

    for (const item of data.cases.filter((candidate) => candidate.workflow === "adapt-codex-skill")) {
      expect(item.repositoryContext).toMatchObject({
        sourceRepository: ADAPTER_REPOSITORY,
        baseSha: ADAPTER_PIN,
      });
      expect(item.rubric.every((criterion) => criterion.source.adapter?.commit === ADAPTER_PIN)).toBe(true);
    }

    const success = data.cases.find(
      (item) => item.id === "adapt-codex-skill-representative-success",
    );
    expect(success?.prompt).toContain("No expected-output Adaptation Spec exists");
    expect(success?.prompt).not.toContain("adaptation-spec.md");
  });

  it("requires positive and negative independent-worker observations", async () => {
    const data = await loadReleaseSuite();
    const reviewCases = data.cases.filter((item) => item.workflow === "code-review");

    expect(reviewCases.map((item) => item.id)).toEqual([
      "code-review-independent-workers",
      "code-review-stop-without-isolation",
    ]);
    expect(
      reviewCases
        .find((item) => item.id === "code-review-independent-workers")
        ?.rubric.map((criterion) => criterion.id),
    ).toContain("independent-workers-parallel");
  });

  it("requires concrete target repositories for the successful adapter observation", async () => {
    const data = await loadReleaseSuite();
    const success = data.cases.find(
      (item) => item.id === "adapt-codex-skill-representative-success",
    );
    if (!success) throw new Error("expected successful adapter observation");

    expect(success.targetEnvironmentRepositories).toEqual([
      "komaksym/chatgpt-chat-skills-mcp",
      "komaksym/mcps-launcher",
      "komaksym/chrome-browser-mcp",
    ]);
  });

  it("validates adapter evidence independently from Skills MCP evidence", async () => {
    const data = await loadReleaseSuite();
    const run = completedReleaseRun(data);
    const valid = await validateReleaseRun(run);
    expect(valid.status).toBe(0);
    expect(valid.stdout).toContain("Validated 5 manual release evaluations.");

    const invalid = run as {
      cases: Array<{
        caseId: string;
        adapted: { skillsMcp: unknown; adapter: unknown };
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

    const rejected = await validateReleaseRun(invalid);
    expect(rejected.status).toBe(1);
    expect(rejected.stderr).toContain("adapter evidence");
  });

  it("rejects successful adapter scoring without every target-environment read record", async () => {
    const data = await loadReleaseSuite();
    const run = completedReleaseRun(data) as {
      cases: Array<{
        caseId: string;
        adapted: {
          targetEnvironment: Array<{ repository: string; commit: string; evidence: string }>;
        };
      }>;
    };
    const success = run.cases.find(
      (item) => item.caseId === "adapt-codex-skill-representative-success",
    );
    if (!success) throw new Error("expected successful adapter observation");
    success.adapted.targetEnvironment.pop();

    const rejected = await validateReleaseRun(run);
    expect(rejected.status).toBe(1);
    expect(rejected.stderr).toContain("targetEnvironment");
  });

  it("rejects a paired case that claims PASS when its baseline failed", async () => {
    const data = await loadReleaseSuite();
    const run = completedReleaseRun(data) as {
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

    const rejected = await validateReleaseRun(run);
    expect(rejected.status).toBe(1);
    expect(rejected.stderr).toContain("baseline condition passes");
  });

  it("rejects completed release gates containing fail or not-observed required cases", async () => {
    const data = await loadReleaseSuite();

    for (const judgment of ["fail", "not-observed"] as const) {
      const run = completedReleaseRun(data) as {
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

      const rejected = await validateReleaseRun(run);
      expect(rejected.status).toBe(1);
      expect(rejected.stderr).toContain("completed release gate cannot pass");
    }
  });

  it("keeps release proof incomplete until the five-case manual record exists", async () => {
    const proof = await readFile(new URL("../docs/release-proof.md", import.meta.url), "utf8");

    expect(proof).toContain("Status: NOT EXERCISED");
    expect(proof).toMatch(/Targeted manual release evaluations:\s+`NOT EXERCISED`/);
  });
});
