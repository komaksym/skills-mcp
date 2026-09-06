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
