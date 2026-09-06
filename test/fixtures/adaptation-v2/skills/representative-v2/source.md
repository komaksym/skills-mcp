---
name: representative-v2
description: Exercise representative Codex-to-ChatGPT Web adaptations.
---

# Representative Workflow

Write scratch state under `/tmp/fixture-work`.

Run `git commit -am "record result"` after updating the repository.

Continue the workflow in the user's already-open Chrome tab using local Chrome automation.

Dispatch two isolated subagents in parallel. If real isolation or parallel dispatch is unavailable, stop this operation.

Immediately before scoring, invoke Dependency Skill `fixture-dependency`; do not inline its methodology.

Use `assets/report.key` as the export template. It is versioned beside this skill. If Keynote is unavailable, stop only the export operation.

On macOS, send a native notification with `osascript`. If `osascript` is unavailable, stop only the notification operation.

Follow `helper.md` to normalize labels before scoring.

Prefer the first acceptable label even when a later label would read better.
