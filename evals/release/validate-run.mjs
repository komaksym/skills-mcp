import { readFile } from "node:fs/promises";
import process from "node:process";
import { URL } from "node:url";

const CASES_URL = new URL("./cases.json", import.meta.url);
const JUDGMENTS = new Set(["pass", "fail", "not-observed"]);
const SKILLS_MCP_REPOSITORY = "komaksym/chatgpt-chat-skills-mcp";
const ADAPTER_WORKFLOW = "adapt-codex-skill";
const COMMIT = /^[a-f0-9]{40}$/;

function fail(message) {
  throw new Error(message);
}

function object(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(label + " must be an object.");
  }
  return value;
}

function text(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    fail(label + " must be a non-empty string.");
  }
  return value;
}

function same(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function adapterSource(definition) {
  const references = definition.rubric.map((criterion) => criterion.source?.adapter);
  if (references.some((reference) => !reference)) {
    fail(definition.id + " adapter criteria must all name the pinned adapter source.");
  }
  const first = object(references[0], definition.id + ".adapter source");
  for (const referenceValue of references.slice(1)) {
    const reference = object(referenceValue, definition.id + ".adapter source");
    if (reference.commit !== first.commit || reference.path !== first.path) {
      fail(definition.id + " adapter criteria must use one pinned adapter commit and path.");
    }
  }
  return first;
}

function definitions(suite) {
  if (suite.version !== 4 || suite.mode !== "manual-release-only" || !Array.isArray(suite.cases)) {
    fail("cases.json must be a version 4 manual-release-only suite.");
  }

  const seen = new Set();
  const counts = new Map();
  for (const definition of suite.cases) {
    text(definition.id, "case.id");
    if (definition.mode !== "paired" && definition.mode !== "observation") {
      fail(definition.id + ".mode must be paired or observation.");
    }
    text(definition.workflow, definition.id + ".workflow");
    text(definition.model, definition.id + ".model");
    text(definition.task, definition.id + ".task");
    text(definition.prompt, definition.id + ".prompt");
    if (seen.has(definition.id)) fail("duplicate case id " + definition.id);
    seen.add(definition.id);
    counts.set(definition.workflow, (counts.get(definition.workflow) ?? 0) + 1);
    if (!Array.isArray(definition.capabilities) || definition.capabilities.length === 0) {
      fail(definition.id + ".capabilities must be a non-empty array.");
    }
    if (
      definition.targetEnvironmentRepositories !== undefined &&
      (!Array.isArray(definition.targetEnvironmentRepositories) ||
        new Set(definition.targetEnvironmentRepositories).size !==
          definition.targetEnvironmentRepositories.length ||
        definition.targetEnvironmentRepositories.some(
          (repository) => typeof repository !== "string" || repository.trim() === "",
        ))
    ) {
      fail(definition.id + ".targetEnvironmentRepositories must be a unique string array.");
    }
    if (!Array.isArray(definition.rubric) || definition.rubric.length === 0) {
      fail(definition.id + ".rubric must be a non-empty array.");
    }
    for (const criterion of definition.rubric) {
      if (
        criterion.requiresExternalEvidence !== undefined &&
        typeof criterion.requiresExternalEvidence !== "boolean"
      ) {
        fail(definition.id + "." + criterion.id + ".requiresExternalEvidence must be boolean.");
      }
    }
    if (definition.workflow === ADAPTER_WORKFLOW) {
      adapterSource(definition);
    }
  }
  for (const [workflow, count] of counts) {
    if (count > 2) fail(workflow + " has more than two representative cases.");
  }
  return new Map(suite.cases.map((item) => [item.id, item]));
}

function validateEvidenceSource(item, definition, releaseSha, label) {
  if (definition.workflow === ADAPTER_WORKFLOW) {
    if (item.skillsMcp !== null) {
      fail(label + ".skillsMcp must be null when adapter evidence is required.");
    }
    const expected = adapterSource(definition);
    const adapter = object(item.adapter, label + ".adapter evidence");
    if (
      adapter.repository !== definition.repositoryContext.sourceRepository ||
      adapter.commit !== expected.commit ||
      adapter.path !== expected.path
    ) {
      fail(label + ".adapter evidence must match the fixed adapter repository, commit, and path.");
    }
    text(adapter.evidence, label + ".adapter.evidence");
    return;
  }

  if (item.adapter !== null) {
    fail(label + ".adapter must be null for Skills MCP workflow evidence.");
  }
  const skillsMcp = object(item.skillsMcp, label + ".skillsMcp");
  if (skillsMcp.repository !== SKILLS_MCP_REPOSITORY) {
    fail(label + ".skillsMcp.repository must identify the evaluated Skills MCP repository.");
  }
  if (skillsMcp.releaseSha !== releaseSha) {
    fail(label + ".Skills MCP release SHA must match run.releaseSha.");
  }
  text(skillsMcp.evidence, label + ".skillsMcp.evidence");
}

function validateTargetEnvironment(item, definition, label) {
  const expected = definition.targetEnvironmentRepositories ?? [];
  if (!Array.isArray(item.targetEnvironment) || item.targetEnvironment.length !== expected.length) {
    fail(label + ".targetEnvironment must record every fixed target repository exactly once.");
  }

  for (let index = 0; index < expected.length; index += 1) {
    const actual = object(
      item.targetEnvironment[index],
      label + ".targetEnvironment[" + index + "]",
    );
    if (actual.repository !== expected[index]) {
      fail(label + ".targetEnvironment repositories/order must match the fixed target inventory.");
    }
    if (!COMMIT.test(text(actual.commit, label + ".targetEnvironment[" + index + "].commit"))) {
      fail(label + ".targetEnvironment commit must be a 40-character commit SHA.");
    }
    text(actual.evidence, label + ".targetEnvironment[" + index + "].evidence");
  }
}

function variant(value, definition, expectedSkill, releaseSha, label) {
  const item = object(value, label);
  if (item.skill !== expectedSkill) fail(label + ".skill does not match the fixed condition.");
  if (item.model !== definition.model) fail(label + ".model does not match the fixed case model.");

  validateEvidenceSource(item, definition, releaseSha, label);
  validateTargetEnvironment(item, definition, label);

  if (!same(item.capabilities, definition.capabilities)) {
    fail(label + ".capabilities must exactly match the fixed case capabilities.");
  }

  const repository = object(item.repository, label + ".repository");
  text(repository.url, label + ".repository.url");
  if (
    repository.sourceRepository !== definition.repositoryContext.sourceRepository ||
    repository.baseSha !== definition.repositoryContext.baseSha
  ) {
    fail(label + ".repository must match the fixed source repository and base SHA.");
  }

  if (!Array.isArray(item.externalResults)) fail(label + ".externalResults must be an array.");
  const output = typeof item.output === "string" ? item.output.trim() : "";
  if (output === "" && item.externalResults.length === 0) {
    fail(label + " must record relevant output or an external result.");
  }

  if (!Array.isArray(item.rubric) || item.rubric.length !== definition.rubric.length) {
    fail(label + ".rubric must contain every fixed criterion.");
  }
  const passedExternalCriteria = [];
  for (let index = 0; index < definition.rubric.length; index += 1) {
    const expectedCriterion = definition.rubric[index];
    const actual = object(item.rubric[index], label + ".rubric[" + index + "]");
    if (actual.id !== expectedCriterion.id) {
      fail(label + ".rubric ids/order must match the fixed rubric.");
    }
    if (!JUDGMENTS.has(actual.judgment)) fail(label + "." + actual.id + ".judgment is invalid.");
    text(actual.evidence, label + "." + actual.id + ".evidence");
    if (expectedCriterion.requiresExternalEvidence && actual.judgment === "pass") {
      passedExternalCriteria.push(actual.id);
    }
  }

  const externalByCriterion = new Map();
  for (let index = 0; index < item.externalResults.length; index += 1) {
    const external = object(
      item.externalResults[index],
      label + ".externalResults[" + index + "]",
    );
    const criterionId = text(
      external.criterionId,
      label + ".externalResults[" + index + "].criterionId",
    );
    text(external.evidence, label + ".externalResults[" + index + "].evidence");
    if (externalByCriterion.has(criterionId)) {
      fail(label + ".externalResults must bind each criterion at most once.");
    }
    externalByCriterion.set(criterionId, external.evidence);
  }

  if (externalByCriterion.size !== passedExternalCriteria.length) {
    fail(label + ".externalResults must contain exactly one result for each passing external criterion.");
  }
  const passedExternalSet = new Set(passedExternalCriteria);
  for (const criterionId of passedExternalCriteria) {
    if (!externalByCriterion.has(criterionId)) {
      fail(label + ".externalResults is missing evidence for passing criterion " + criterionId + ".");
    }
  }
  for (const criterionId of externalByCriterion.keys()) {
    if (!passedExternalSet.has(criterionId)) {
      fail(label + ".externalResults references non-passing external criterion " + criterionId + ".");
    }
  }

  if (typeof item.pass !== "boolean") fail(label + ".pass must be boolean.");
  text(item.rationale, label + ".rationale");
  if (item.pass && item.rubric.some((entry) => entry.judgment !== "pass")) {
    fail(label + " cannot pass unless every rubric item passes.");
  }
  return { repository, pass: item.pass };
}

async function main() {
  const runPath = process.argv[2];
  if (!runPath) fail("Usage: node evals/release/validate-run.mjs <completed-run.json>");

  const suite = JSON.parse(await readFile(CASES_URL, "utf8"));
  const byId = definitions(suite);
  const run = object(JSON.parse(await readFile(runPath, "utf8")), "run");

  if (run.mode !== "manual-release") fail("run.mode must be manual-release.");
  text(run.runId, "run.runId");
  if (!COMMIT.test(text(run.releaseSha, "run.releaseSha"))) {
    fail("run.releaseSha must be a 40-character commit SHA.");
  }
  if (!Array.isArray(run.cases) || run.cases.length !== byId.size) {
    fail("run.cases must contain exactly one result for every defined case.");
  }

  const seen = new Set();
  let gatePassed = true;
  for (const resultValue of run.cases) {
    const result = object(resultValue, "case result");
    const caseId = text(result.caseId, "case result.caseId");
    if (seen.has(caseId)) fail("duplicate run case " + caseId);
    seen.add(caseId);

    const definition = byId.get(caseId);
    if (!definition) fail("unknown evaluation case " + caseId);
    if (result.mode !== definition.mode) {
      fail(caseId + ".mode must match the fixed evaluation mode.");
    }
    if (
      result.task !== definition.task ||
      result.prompt !== definition.prompt ||
      (result.followUp ?? null) !== (definition.followUp ?? null)
    ) {
      fail(caseId + " task/prompt/followUp must match the fixed case exactly.");
    }

    let baseline = null;
    if (definition.mode === "paired") {
      baseline = variant(
        result.baseline,
        definition,
        null,
        run.releaseSha,
        caseId + ".baseline",
      );
    } else if (result.baseline !== null) {
      fail(caseId + ".baseline must be null for an observation case.");
    }
    const adapted = variant(
      result.adapted,
      definition,
      definition.workflow,
      run.releaseSha,
      caseId + ".adapted",
    );
    if (
      definition.mode === "paired" &&
      definition.repositoryContext.writes &&
      baseline.repository.url === adapted.repository.url
    ) {
      fail(caseId + " writable variants must use separate disposable repositories.");
    }

    if (typeof result.pass !== "boolean") fail(caseId + ".pass must be boolean.");
    text(result.rationale, caseId + ".rationale");
    if (result.pass && definition.mode === "paired" && !baseline.pass) {
      fail(caseId + " paired result cannot pass unless the baseline condition passes.");
    }
    if (result.pass && !adapted.pass) {
      fail(caseId + " result cannot pass unless the adapted condition passes.");
    }
    if (!result.pass) gatePassed = false;
    text(result.comparison, caseId + ".comparison");
  }

  if (!gatePassed) {
    fail("completed release gate cannot pass unless every defined case passes.");
  }

  process.stdout.write(
    "Validated " + run.cases.length + " manual release evaluations.\n",
  );
}

main().catch((error) => {
  process.stderr.write((error instanceof Error ? error.message : String(error)) + "\n");
  process.exitCode = 1;
});
