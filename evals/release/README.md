# Behavioral release evaluations

This suite is **manual/release only**. It answers one practical question: does the
product preserve the highest-risk upstream outcomes at the ChatGPT Web boundary?
It deliberately uses one paired no-skill/with-skill workflow plus focused
observation cases; it is not an exhaustive skill-by-skill benchmark. Where a
comparison is used, the same model receives the same task in the same repository
context with the same live capabilities.

The stochastic model runs are not routine CI. CI may validate the definitions and
record format, but it must not call a model. Exact Mechanical Projection generation,
source integrity, MCP protocol checks, and other deterministic behavior remain the
job of the normal test suite and issue #13.

## Source of truth

Judge behavior only from the pinned behavioral source plus the Skill Adaptation
Contract in issue #1. Workflow rubric items in `cases.json` name their pinned upstream
commit, upstream `SKILL.md` section, and contract user story. Adapter rubric items may
instead name the pinned `docs/adapt-codex-skill.md` section they exercise. Do not derive
judgments from a locally rewritten `runtime.md`, provenance prose, evaluator
preference, or remembered expected output. The successful representative adapter
source fixture is pinned to a commit where no expected-output Adaptation Spec exists.

This matters especially for allowed adaptations: evaluate the upstream outcome, not
the local mechanism. For example, architecture reporting is judged by the upstream
candidate fields and selection boundary rather than by whether the adapted runtime
uses the upstream HTML delivery mechanism.

## Evaluation protocol

1. Prepare fresh contexts exactly as `repositoryContext.reset` says. If a paired case
   permits writes, the baseline and adapted variants must use separate disposable
   repositories so one cannot contaminate the other.
2. Fix each case's `model`, `task`, repository base SHA and fixture, `capabilities`,
   `prompt`, optional `followUp`, and rubric exactly as defined in `cases.json`.
3. For an MCP workflow variant, run against a Skills MCP built from the exact release
   candidate commit being evaluated. Record that commit as `releaseSha`, record how the
   running revision was verified, and pass the same exact commit to the validator as
   `<evaluated-release-sha>`. Do not substitute the current PR head unless that is the
   revision whose behavior the manual run actually exercised.
4. For an external `adapt-codex-skill` observation, do **not** pretend the adapter is an
   MCP-loaded skill. Load the exact `docs/adapt-codex-skill.md` commit/path named by the
   rubric source and record evidence that this exact document was the behavioral
   source. The adapter pin is independent of `run.releaseSha`.
5. If the case defines `targetEnvironmentRepositories`, inspect every listed repository
   directly before scoring target mappings. Record each observed current 40-character
   commit and concise read evidence in `targetEnvironment`. Output semantics alone do
   not establish that the adapter inspected current Skills MCP, `mcps-launcher`, or the
   relevant MCP implementation.
6. Paired baseline: use a fresh conversation and do **not** load the evaluated MCP
   workflow. Paired adapted: use another fresh conversation and load only the named
   public workflow. Observation cases use one fresh direct-observation context.
7. Send the fixed `followUp` only at the scripted boundary. If a variant crosses that
   boundary early, record the relevant rubric failure before continuing.
8. A failed or unavailable Live Capability never passes because a weaker fallback
   produced something convenient. Judge against the source-required stop behavior or
   other fallback declared by the pinned behavioral source.
9. Record relevant model output and any durable external result needed to verify the
   behavior. Claims about GitHub mutations, tests, commits, PRs, labels, relationships,
   or worker execution require observed external evidence. For every passing rubric
   criterion marked `requiresExternalEvidence`, record exactly one `externalResults`
   object with that criterion's `criterionId`, a non-empty durable `evidence` string,
   and the criterion-specific machine-checkable facts described below. Do not reuse one
   generic result for multiple unrelated criteria; one durable artifact may still
   legitimately support multiple related criteria when each criterion records the
   required facts.

For GitHub publication criteria (`ready-for-agent` and `observed-publication`), record
`facts.githubIssue` with the durable GitHub issue URL and the observed label list. The
`ready-for-agent` criterion passes structurally only when that list contains
`ready-for-agent`.

For the positive independent-worker observation, record `facts.workers` with at least
two distinct worker IDs. Each worker must record `isolated: true`, `directGithub: true`,
and dispatch/start/completion timestamps. Also record `barrierSatisfied: true`, the
barrier-completion timestamp, the first-result-consumption timestamp, and the
synthesis-start timestamp. The validator requires overlapping worker intervals and
requires the completed parent barrier before either result is consumed or synthesis
starts. Do not infer parallelism merely because two reviews were eventually returned.

For the negative strict-review observation, record facts showing
`isolationAvailable: false`, `strictReviewStopped: true`, and
`sequentialFallbackUsed: false`.

For `inspects-current-target-environment`, the machine-checkable facts are the case's
existing `targetEnvironment` records: every fixed repository, exact observed
40-character commit, and non-empty read evidence must be present in fixed order.

For observation cases, set `baseline` to `null` and use the adapted record to capture
the direct observation. Do not invent a no-skill comparison for worker capability or
adapter behavior when direct observation is the meaningful test.

The suite contains one representative normal workflow plus focused observations for
successful independent-worker execution, truthful stopping when isolation is
unavailable, adapter missing-required-material behavior, and a successful adapter run
over a complete representative v2 bundle. The successful adapter observation is
semantic but not output-only: judge preservation, runtime mappings, helper and
Dependency Skill boundaries, truthful provenance, current target-environment read
evidence, and completion of the Adaptation Spec. Do not snapshot exact wording.

## Recording

Copy `run-template.json` to a release record outside routine CI artifacts. For every
variant record, capture the exact model, repository URL/base, capabilities, relevant
output and external results, every rubric judgment with evidence, and overall
pass/fail with a short rationale. `externalResults` uses this criterion-bound shape:

```json
[
  {
    "criterionId": "<rubric criterion id>",
    "evidence": "<durable observed external result for this criterion>",
    "facts": {}
  }
]
```

`facts` is required when the current criterion has an objective structure described
above. The target-environment criterion uses `targetEnvironment` itself rather than
duplicating those records in `facts`.

There must be exactly one such entry for every passing rubric criterion whose fixed
case definition has `requiresExternalEvidence: true`, with no duplicate or unrelated
criterion IDs. `targetEnvironment` is an empty array unless the case defines required
target repositories; when required, it must contain exactly those repositories in the
fixed order with the observed commit and read evidence.

Evidence-source fields are mutually exclusive:

- MCP workflow variants use `skillsMcp` with repository
  `komaksym/chatgpt-chat-skills-mcp`, the observed `releaseSha`, and evidence showing
  how the running revision was identified; set `adapter` to `null`.
- External-adapter observations set `skillsMcp` to `null` and use `adapter` with
  repository `komaksym/skills-mcp`, the pinned adapter commit and path, and evidence
  showing that exact document was loaded for the run.

An adapter evidence record with target reads has this shape:

```json
{
  "skillsMcp": null,
  "adapter": {
    "repository": "komaksym/skills-mcp",
    "commit": "<pinned adapter commit>",
    "path": "docs/adapt-codex-skill.md",
    "evidence": "<how this exact document was observed as the behavioral source>"
  },
  "targetEnvironment": [
    {
      "repository": "<required target repository>",
      "commit": "<observed current commit>",
      "evidence": "<what was read to establish the target mapping>"
    }
  ]
}
```

Then write the behavioral delta in `comparison` for paired cases. Observation cases
should state what was directly observed instead. A variant may legitimately fail; the
record must say why rather than turning `not-observed` into success. Such a record is
useful evidence, but it does not pass the release gate.

Validate the completed record against the exact Skills MCP release candidate whose
behavior the run exercised:

```bash
node evals/release/validate-run.mjs path/to/completed-run.json <evaluated-release-sha>
```

The validator rejects the record unless `run.releaseSha` equals that explicit
candidate SHA, then checks comparability, criterion-specific external evidence, and
release-gate completeness. A completed gate is rejected unless every required case
passes, including both sides of the paired case. It does not independently judge model
quality and does not execute model calls.
