# Faithful ChatGPT Web release proof

Status: NOT EXERCISED

This record preserves previously observed release evidence, but the current targeted
manual gate is incomplete. Keep the overall status at `NOT EXERCISED` until every
case in the current five-case suite has one truthful completed observation record
that validates with `node evals/release/validate-run.mjs`.

The historical records from 2026-08-29 to 2026-08-31 remain useful evidence, but they
predate the current-head positive independent-worker observation and the two
`adapt-codex-skill` observations now required by `evals/release/cases.json`. They
therefore cannot establish the current release PASS.

## Historical local and ChatGPT Web evidence — 2026-08-29 to 2026-08-31

The deterministic gates were exercised on the historical release branch with:

```sh
npm run lint
npm run typecheck
npm test
npm run build
npm run corpus:check
```

A built service returned HTTP 200 with exactly `{"status":"ok"}` from `/healthz`.
The dedicated Secure MCP Tunnel path was observed healthy in a credentialed local
session without recording credentials or machine-local configuration in this file.

A connected ChatGPT Web Developer Mode conversation discovered exactly the two MCP
tools `load_skill` and `list_skills`. `list_skills` returned exactly seven public
skills: `code-review`, `grill-with-docs`, `handoff`, `implement`,
`improve-codebase-architecture`, `to-spec`, and `to-tickets`. The hidden Dependency
Skills `codebase-design`, `domain-modeling`, `grilling`, and `tdd` were absent from
public listing but exact-loadable when requested by upstream composition.

A representative loaded runtime showed the Runtime Envelope plus only the requested
Generated Runtime. Dependency timing was observed as separate loads rather than
inlining. An intentionally unavailable GitHub-write capability caused `to-spec` to
stop instead of silently producing a weaker substitute.

The connected GitHub capability also exercised a disposable fixture with real issue
creation, native labels including `ready-for-agent`, closure, and read-back. This
satisfied the historical requirement that at least one external result be a native
GitHub relationship or label outcome rather than Markdown text describing tracker
state.

## Historical strict child-conversation evidence

A strict code-review canary was exercised with two genuinely independent child
conversations. Both independently resolved the same committed repository head through
connected GitHub, neither received parent-pasted repository evidence, and private
markers showed no sibling-marker exposure. This remains historical evidence; any gate
that explicitly requires the current head must be rerun against the current head.

The strict rule remains: when the required Live Capability for genuinely independent
review contexts is unavailable, the workflow must stop rather than simulate isolation
with sequential parent-context passes.

## Historical targeted manual evaluation — 2026-08-31

The historical three-case record is
[`evals/release/runs/2026-08-31-ee5bc-paired-and-observations.json`](../evals/release/runs/2026-08-31-ee5bc-paired-and-observations.json).
It recorded the then-current suite at behavior head
`ee5bc1941387e7b48a503d9d272d83abf2fe32f6`:

- `representative-to-spec` used fresh separate fixtures for baseline and adapted
  variants; the adapted variant loaded only `to-spec`, honored the confirmation
  boundary, then published and read back a native GitHub issue with
  `ready-for-agent`.
- `grill-with-docs-dependency-timing` observed separate `grilling` and
  `domain-modeling` dependency loads immediately at the parent composition point.
- `code-review-stop-without-isolation` observed truthful stopping when independent
  direct-GitHub child contexts were declared unavailable.

Those observations remain historical evidence for those fixed behaviors. They do
**not** satisfy the current suite because the current gate now requires a fresh
positive independent-worker observation and both external adapter observations below.

## Current targeted manual gate

Follow `evals/release/README.md` exactly and record one result for every case in the
current five-case suite:

1. `representative-to-spec`
2. `code-review-independent-workers`
3. `code-review-stop-without-isolation`
4. `adapt-codex-skill-missing-supporting-document`
5. `adapt-codex-skill-representative-success`

The positive code-review observation must run the current Skills MCP release revision,
identify at least two genuinely independent direct-GitHub child workers, demonstrate
overlapping execution rather than sequential simulation, and show that the parent
waited for the independent-review barrier before synthesis. The historical child
canary is not a substitute for this current-head observation.

The two adapter observations use the pinned external
`docs/adapt-codex-skill.md` as their behavioral source. They are not Skills MCP-loaded
workflow observations and must record adapter evidence separately from Skills MCP
evidence. The pinned adapter/source tree is oracle-free: the representative fixture
does not contain a pre-authored expected Adaptation Spec.

The missing-Supporting-Document observation must name the missing required document
and stop before a completed Adaptation Spec. The successful observation must run the
pinned adapter against the complete representative v2 bundle and verify faithful
preservation, required runtime mappings, deterministic helper preservation, Dependency
Skill identity/timing, explicit absent Source Provenance, and a complete issue-ready
Adaptation Spec. It must also record the observed current commit and direct read
evidence for every target repository named by `targetEnvironmentRepositories`; output
semantics or remembered mappings alone are insufficient. Exact wording snapshots are
not evidence of semantic fidelity.

No completed five-case manual record is committed yet. Do not infer the current-head
independent-worker observation from its historical canary, do not infer either adapter
observation from deterministic fixture tests, and do not manufacture a PASS from the
historical three-case record.

## Preconditions for a new current record

1. Build the exact release revision used by the MCP workflow cases and observe the
   loopback health response.
2. For MCP workflow cases, record the observed Skills MCP revision and how it was
   verified. This exact evaluated revision, not an incidental PR head, is the SHA that
   must be supplied to the validator alongside the completed record.
3. For the positive code-review case, record distinct worker identities plus evidence
   of overlapping execution and barrier completion before synthesis.
4. For external adapter cases, load the exact pinned adapter commit/path and record
   evidence that this document was the behavioral source; do not represent it as an
   MCP-loaded skill.
5. For any case with `targetEnvironmentRepositories`, directly inspect every required
   target repository and record its observed current commit and read evidence.
6. Use fresh contexts and the fixed model, prompt, repository context, capabilities,
   and rubric from `evals/release/cases.json`.
7. Record observed external results whenever a criterion requires them, including the
   criterion-specific machine-checkable facts documented in `evals/release/README.md`.
8. Validate the completed record with:

```sh
node evals/release/validate-run.mjs path/to/completed-run.json <evaluated-release-sha>
```

Captured evidence must contain no secrets, tunnel credentials, or machine-local
configuration values.

## Deterministic and behavioral gates

Before declaring the project complete, record fresh successful execution of:

```sh
npm run lint
npm run typecheck
npm test
npm run build
npm run corpus:check
```

Deterministic CI proves repository mechanics; it does not substitute for stochastic
manual adapter or independent-worker observations.

## Maintenance scope

Issue [#12](https://github.com/komaksym/chatgpt-chat-skills-mcp/issues/12) remains
post-release maintenance work and is not a blocker for this release proof.

## Result

- Overall status: `NOT EXERCISED`
- Historical ChatGPT Web / tunnel smoke: PASS for the observations recorded above; this does not complete the expanded current manual gate
- Historical strict code-review smoke: PASS for the recorded isolated-child canary; the current-head positive-worker gate is still unexercised
- Deterministic corpus gates: require fresh CI evidence on the final PR head before completion
- Targeted manual release evaluations: `NOT EXERCISED` — the historical evidence does not satisfy the current five-case suite; a current-head independent-worker observation, both pinned external-adapter observations, and one complete validated five-case record are still required
