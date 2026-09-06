import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { afterEach, describe, expect, it } from "vitest";

import { REMOTE_EXECUTION_CONTRACT } from "../src/contract.js";
import { generateSkillRuntime } from "../src/projection.js";
import { parseSkillProvenance } from "../src/provenance.js";
import { startService, type RunningService } from "../src/service.js";

const FIXTURE_ROOT = fileURLToPath(
  new URL("./fixtures/adaptation-v2/", import.meta.url),
);
const SKILLS_ROOT = join(FIXTURE_ROOT, "skills");
const REPRESENTATIVE_ROOT = join(SKILLS_ROOT, "representative-v2");
const DEPENDENCY_ROOT = join(SKILLS_ROOT, "fixture-dependency");

function extractJavaScript(markdown: string): string {
  const match = markdown.match(/```javascript\n(?<source>[\s\S]*?)\n```/);
  if (!match?.groups?.source) {
    throw new Error("Expected one executable JavaScript helper block.");
  }
  return match.groups.source;
}

function executeHelper(source: string): string[] {
  const context: { input: string[]; output?: string[] } = {
    input: [" Beta ", "alpha", "ALPHA "],
  };
  runInNewContext(`${source}\noutput = normalizeLabels(input);`, context);
  if (!context.output) {
    throw new Error("Deterministic helper did not produce output.");
  }
  return context.output;
}

describe("v2 adaptation acceptance", () => {
  let service: RunningService | undefined;
  let client: Client | undefined;

  afterEach(async () => {
    await client?.close();
    await service?.close();
    client = undefined;
    service = undefined;
  });

  it("preserves the representative adaptation through projection and MCP", async () => {
    const [source, helper, provenanceSource, committed, dependencyRuntime] =
      await Promise.all([
        readFile(join(REPRESENTATIVE_ROOT, "source.md"), "utf8"),
        readFile(join(REPRESENTATIVE_ROOT, "helper.md"), "utf8"),
        readFile(join(REPRESENTATIVE_ROOT, "provenance.json"), "utf8"),
        readFile(join(REPRESENTATIVE_ROOT, "runtime.md"), "utf8"),
        readFile(join(DEPENDENCY_ROOT, "runtime.md"), "utf8"),
      ]);

    await expect(access(join(FIXTURE_ROOT, "adaptation-spec.md"))).rejects.toMatchObject({
      code: "ENOENT",
    });

    const parsed = parseSkillProvenance(provenanceSource);
    expect(parsed.success).toBe(true);
    if (!parsed.success) {
      throw new Error("Expected valid representative v2 provenance.");
    }
    expect(parsed.data).toMatchObject({ sourceProvenance: { type: "absent" } });
    expect(parsed.data.dependencies).toEqual(["fixture-dependency"]);

    const generated = await generateSkillRuntime("representative-v2", {
      repositoryRoot: FIXTURE_ROOT,
      skillsRoot: SKILLS_ROOT,
    });
    expect(generated).toBe(committed);

    for (const requiredBehavior of [
      "Write scratch state in the ChatGPT sandbox.",
      "Commit the same repository changes through connected GitHub and observe the returned commit result.",
      "Continue the workflow in the user's existing Chrome session through Chrome Browser MCP.",
      "Dispatch genuinely independent ChatGPT child workers in parallel only after Live Capability verifies the required isolation and parallelism; otherwise stop this operation.",
      "Keep it versioned beside this skill in connected GitHub.",
      "Because GitHub storage does not prove a live consumer can use the Repository Asset, stop only the export operation unless a Live Capability for consuming it is verified.",
      "The target has no assumed native macOS application control and no Equivalent Mechanism for this notification, so select the upstream-supported fallback and stop only the notification operation.",
    ]) {
      expect(generated).toContain(requiredBehavior);
    }

    const dependencyTiming =
      "Immediately before scoring, invoke Dependency Skill `fixture-dependency`; do not inline its methodology.";
    expect(source).toContain(dependencyTiming);
    expect(generated).toContain(dependencyTiming);

    const methodology =
      "Prefer the first acceptable label even when a later label would read better.";
    expect(source).toContain(methodology);
    expect(generated).toContain(methodology);

    const upstreamHelper = extractJavaScript(helper);
    expect(extractJavaScript(generated)).toBe(upstreamHelper);
    expect(executeHelper(upstreamHelper)).toEqual(["alpha", "alpha", "beta"]);

    await expect(
      access(join(REPRESENTATIVE_ROOT, "assets", "report.key")),
    ).resolves.toBeUndefined();

    service = await startService({ port: 0, skillsRoot: SKILLS_ROOT });
    client = new Client({ name: "v2-adaptation-e2e", version: "1.0.0" });
    await client.connect(
      new StreamableHTTPClientTransport(new URL("/mcp", service.url)),
    );

    const loaded = CallToolResultSchema.parse(
      await client.callTool({
        name: "load_skill",
        arguments: { name: "representative-v2" },
      }),
    );
    const block = loaded.content[0];
    if (!block || block.type !== "text") {
      throw new Error("Expected text Generated Runtime from load_skill.");
    }
    expect(block.text).toBe(
      REMOTE_EXECUTION_CONTRACT +
        "\n\n# representative-v2\n\n" +
        generated.trim() +
        "\n",
    );
    expect(block.text.split(REMOTE_EXECUTION_CONTRACT)).toHaveLength(2);
    expect(block.text).not.toContain(provenanceSource.trim());
    expect(block.text).not.toContain(dependencyRuntime.trim());
  });
});
