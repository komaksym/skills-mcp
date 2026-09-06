import { describe, expect, it } from "vitest";

import {
  completedReleaseRun,
  loadReleaseSuite,
  validateReleaseRun,
} from "./release-evals-support.js";

describe("release evaluation external evidence", () => {
  it("rejects non-evidence placeholders for externally observed passing criteria", async () => {
    const data = await loadReleaseSuite();

    for (const externalResults of [[null], [""], [{}]] as const) {
      const run = completedReleaseRun(data) as {
        cases: Array<{
          caseId: string;
          adapted: { externalResults: unknown[] };
        }>;
      };
      const observation = run.cases.find(
        (item) => item.caseId === "code-review-independent-workers",
      );
      if (!observation) throw new Error("expected independent-worker observation");
      observation.adapted.externalResults = [...externalResults];

      const rejected = await validateReleaseRun(run);
      expect(rejected.status).toBe(1);
      expect(rejected.stderr).toContain("externalResults");
    }
  });

  it("rejects prose-only evidence for the independent-worker observation", async () => {
    const data = await loadReleaseSuite();
    const run = completedReleaseRun(data) as {
      cases: Array<{
        caseId: string;
        adapted: { externalResults: unknown[] };
      }>;
    };
    const observation = run.cases.find(
      (item) => item.caseId === "code-review-independent-workers",
    );
    if (!observation) throw new Error("expected independent-worker observation");
    observation.adapted.externalResults = [
      { criterionId: "independent-workers-parallel", evidence: "looks good" },
    ];

    const rejected = await validateReleaseRun(run);
    expect(rejected.status).toBe(1);
    expect(rejected.stderr).toContain("independent-workers-parallel");
  });

  it("rejects ready-for-agent evidence whose observed issue lacks the label", async () => {
    const data = await loadReleaseSuite();
    const run = completedReleaseRun(data) as {
      cases: Array<{
        caseId: string;
        adapted: {
          externalResults: Array<{ criterionId: string; facts?: unknown }>;
        };
      }>;
    };
    const paired = run.cases.find((item) => item.caseId === "representative-to-spec");
    if (!paired) throw new Error("expected representative paired case");
    const ready = paired.adapted.externalResults.find(
      (item) => item.criterionId === "ready-for-agent",
    );
    if (!ready) throw new Error("expected ready-for-agent external result");
    ready.facts = {
      githubIssue: {
        url: "https://github.com/example/repository/issues/1",
        state: "open",
        labels: [],
      },
    };

    const rejected = await validateReleaseRun(run);
    expect(rejected.status).toBe(1);
    expect(rejected.stderr).toContain("ready-for-agent");
  });

  it("rejects prose-only publication evidence without an observed GitHub issue", async () => {
    const data = await loadReleaseSuite();
    const run = completedReleaseRun(data) as {
      cases: Array<{
        caseId: string;
        adapted: { externalResults: unknown[] };
      }>;
    };
    const paired = run.cases.find((item) => item.caseId === "representative-to-spec");
    if (!paired) throw new Error("expected representative paired case");
    paired.adapted.externalResults = [
      {
        criterionId: "ready-for-agent",
        evidence: "Observed issue and label.",
        facts: {
          githubIssue: {
            url: "https://github.com/example/repository/issues/1",
            state: "open",
            labels: ["ready-for-agent"],
          },
        },
      },
      { criterionId: "observed-publication", evidence: "looks good" },
    ];

    const rejected = await validateReleaseRun(run);
    expect(rejected.status).toBe(1);
    expect(rejected.stderr).toContain("observed-publication");
  });

  it("rejects stop-without-isolation evidence that records a sequential fallback", async () => {
    const data = await loadReleaseSuite();
    const run = completedReleaseRun(data) as {
      cases: Array<{
        caseId: string;
        adapted: {
          externalResults: Array<{ criterionId: string; facts?: unknown }>;
        };
      }>;
    };
    const observation = run.cases.find(
      (item) => item.caseId === "code-review-stop-without-isolation",
    );
    if (!observation) throw new Error("expected stop-without-isolation observation");
    const stopped = observation.adapted.externalResults.find(
      (item) => item.criterionId === "stop-instead-degrade",
    );
    if (!stopped) throw new Error("expected stop-instead-degrade external result");
    stopped.facts = {
      isolationAvailable: false,
      strictReviewStopped: true,
      sequentialFallbackUsed: true,
    };

    const rejected = await validateReleaseRun(run);
    expect(rejected.status).toBe(1);
    expect(rejected.stderr).toContain("stop-instead-degrade");
  });

  it("rejects one generic external result shared across unrelated passing criteria", async () => {
    const data = await loadReleaseSuite();
    const run = completedReleaseRun(data) as {
      cases: Array<{
        caseId: string;
        adapted: { externalResults: unknown[] };
      }>;
    };
    const paired = run.cases.find((item) => item.caseId === "representative-to-spec");
    if (!paired) throw new Error("expected representative paired case");
    paired.adapted.externalResults = ["One generic external result."];

    const rejected = await validateReleaseRun(run);
    expect(rejected.status).toBe(1);
    expect(rejected.stderr).toContain("externalResults");
  });

  it("rejects duplicate binding that leaves another external criterion unsupported", async () => {
    const data = await loadReleaseSuite();
    const run = completedReleaseRun(data) as {
      cases: Array<{
        caseId: string;
        adapted: { externalResults: unknown[] };
      }>;
    };
    const paired = run.cases.find((item) => item.caseId === "representative-to-spec");
    if (!paired) throw new Error("expected representative paired case");
    paired.adapted.externalResults = [
      { criterionId: "ready-for-agent", evidence: "Observed label state." },
      { criterionId: "ready-for-agent", evidence: "Observed issue state." },
    ];

    const rejected = await validateReleaseRun(run);
    expect(rejected.status).toBe(1);
    expect(rejected.stderr).toContain("externalResults");
  });
});
