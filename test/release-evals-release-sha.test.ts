import { describe, expect, it } from "vitest";

import {
  completedReleaseRun,
  loadReleaseSuite,
  validateReleaseRun,
} from "./release-evals-support.js";

describe("release evaluation revision binding", () => {
  it("rejects a run whose recorded release SHA differs from the intended evaluated revision", async () => {
    const data = await loadReleaseSuite();
    const run = completedReleaseRun(data) as {
      releaseSha: string;
      cases: Array<{
        baseline: null | { skillsMcp: null | { releaseSha: string } };
        adapted: { skillsMcp: null | { releaseSha: string } };
      }>;
    };
    const unrelatedSha = "b".repeat(40);
    run.releaseSha = unrelatedSha;
    for (const item of run.cases) {
      for (const variant of [item.baseline, item.adapted]) {
        if (variant?.skillsMcp) variant.skillsMcp.releaseSha = unrelatedSha;
      }
    }

    const rejected = await validateReleaseRun(run);
    expect(rejected.status).toBe(1);
    expect(rejected.stderr).toContain("intended evaluated release revision");
  });
});
