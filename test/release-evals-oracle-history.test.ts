import { spawnSync } from "node:child_process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { ADAPTER_PIN } from "./release-evals-support.js";

const ROOT = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const ANSWER_KEY_PATH = "test/fixtures/adaptation-v2/adaptation-spec.md";

describe("release adapter oracle isolation", () => {
  it("pins a fixture whose ancestry never contained the expected Adaptation Spec", () => {
    const history = spawnSync(
      "git",
      ["rev-list", ADAPTER_PIN, "--", ANSWER_KEY_PATH],
      { cwd: ROOT, encoding: "utf8" },
    );

    expect(history.status).toBe(0);
    expect(history.stderr).toBe("");
    expect(history.stdout.trim()).toBe("");
  });
});
