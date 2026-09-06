import { spawnSync } from "node:child_process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { ADAPTER_PIN } from "./release-evals-support.js";

const ROOT = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const ORACLE_PATHS = [
  "test/fixtures/adaptation-v2/adaptation-spec.md",
  "test/fixtures/adaptation-v2/skills/representative-v2/runtime.md",
  "test/fixtures/adaptation-v2/skills/representative-v2/provenance.json",
];

describe("release adapter oracle isolation", () => {
  it("pins a fixture whose ancestry never contained adapted-output answer artifacts", () => {
    for (const path of ORACLE_PATHS) {
      const history = spawnSync(
        "git",
        ["rev-list", ADAPTER_PIN, "--", path],
        { cwd: ROOT, encoding: "utf8" },
      );

      expect(history.status).toBe(0);
      expect(history.stderr).toBe("");
      expect(history.stdout.trim(), path).toBe("");
    }
  });
});
