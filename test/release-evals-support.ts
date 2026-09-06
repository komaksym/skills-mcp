import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const RELEASE_ROOT = new URL("../evals/release/", import.meta.url);
export const UPSTREAM_PIN = "6654f6b60cd9d5be8b54c6fafe44346dabeb3b76";
export const WORKFLOW_REPOSITORY = "komaksym/chatgpt-chat-skills-mcp";
export const WORKFLOW_PIN = "de37f7c16bb2ec229f13d3edbde8cdcb3dcfe246";
export const ADAPTER_REPOSITORY = "komaksym/skills-mcp";
export const ADAPTER_PIN = "94226fc2a9a37039ba31c7bb58676aca531154eb";

export interface SourceReference {
  commit: string;
  path: string;
  section: string;
}

export interface RubricCriterion {
  id: string;
  passWhen: string;
  requiresExternalEvidence?: boolean;
  source: {
    upstream?: SourceReference;
    adapter?: SourceReference;
    contract: { issue: number; userStory: number };
  };
}

export interface EvaluationCase {
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
  targetEnvironmentRepositories?: string[];
  capabilities: string[];
  rubric: RubricCriterion[];
}

export interface Suite {
  version: number;
  mode: string;
  cases: EvaluationCase[];
}

export async function loadReleaseSuite(): Promise<Suite> {
  return JSON.parse(
    await readFile(new URL("cases.json", RELEASE_ROOT), "utf8"),
  ) as Suite;
}

export function completedReleaseRun(data: Suite): Record<string, unknown> {
  const releaseSha = "a".repeat(40);
  return {
    mode: "manual-release",
    runId: "test-run",
    releaseSha,
    cases: data.cases.map((item, index) => {
      const rubric = item.rubric.map((criterion) => ({
        id: criterion.id,
        judgment: "pass",
        evidence: "Observed fixture evidence.",
      }));
      const externalResults = item.rubric
        .filter((criterion) => criterion.requiresExternalEvidence)
        .map((criterion) => ({
          criterionId: criterion.id,
          evidence: "Observed external fixture result for " + criterion.id + ".",
        }));
      const repository = {
        sourceRepository: item.repositoryContext.sourceRepository,
        baseSha: item.repositoryContext.baseSha,
      };
      const evidence = item.workflow === "adapt-codex-skill"
        ? {
            skillsMcp: null,
            adapter: {
              repository: ADAPTER_REPOSITORY,
              commit: ADAPTER_PIN,
              path: "docs/adapt-codex-skill.md",
              evidence: "Observed fixture adapter revision.",
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
      const targetEnvironment = (item.targetEnvironmentRepositories ?? []).map(
        (repositoryName, targetIndex) => ({
          repository: repositoryName,
          commit: String((targetIndex % 9) + 1).repeat(40),
          evidence: "Observed current repository revision before scoring.",
        }),
      );
      const variant = (skill: string | null, suffix: string) => ({
        skill,
        model: item.model,
        ...evidence,
        repository: { ...repository, url: `https://example.test/${suffix}-${index}` },
        targetEnvironment: targetEnvironment.map((entry) => ({ ...entry })),
        capabilities: item.capabilities,
        output: "Observed output.",
        externalResults: externalResults.map((entry) => ({ ...entry })),
        rubric: rubric.map((entry) => ({ ...entry })),
        pass: true,
        rationale: "Observed fixture completed.",
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
        rationale: "Adapted condition meets the fixed rubric.",
        comparison: item.mode === "paired" ? "Recorded behavioral delta." : "Direct observation.",
      };
    }),
  };
}

export async function validateReleaseRun(run: unknown): Promise<{
  status: number | null;
  stdout: string;
  stderr: string;
}> {
  const directory = await mkdtemp(join(tmpdir(), "release-evals-"));
  const runPath = join(directory, "run.json");
  const validatorPath = fileURLToPath(new URL("validate-run.mjs", RELEASE_ROOT));
  try {
    await writeFile(runPath, JSON.stringify(run), "utf8");
    const result = spawnSync(process.execPath, [validatorPath, runPath], {
      encoding: "utf8",
    });
    return {
      status: result.status,
      stdout: result.stdout,
      stderr: result.stderr,
    };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
