# Code review guide

Use this guide for code review tasks. A review inspects and reports; it does not change source code unless the request explicitly asks for edits.

## Scope of a review

- Review only the diff or files named in the request.
- Do not expand the review into adjacent systems or future work.
- If asked to review a prompt for scope creep, judge whether the prompt is narrow, explicit, and safe to run; do not edit source code.

## What to check

- **Correctness:** Does the change do what the prompt or request states? Are edge cases handled?
- **Scope:** Does the diff match the stated `Required changes`? Flag anything outside scope.
- **Safety:** No secrets, tokens, `.env*` files, or private paths introduced. No `docs-dev/` material (prompt files, planning, notes) routed into the deployed build output.
- **Deployment safety:** For static-site changes, confirm no source maps or private references would reach the public build.
- **Clarity:** Names, structure, and comments are clear where a reader would otherwise be confused.
- **Tests/checks:** Were the prompt's stated checks run, and did they pass?

## Output

Report findings grouped as:

1. **Blocking** — must be fixed before merge.
2. **Non-blocking** — worth addressing but not required.
3. **Questions** — anything ambiguous that needs a human decision.

State clearly whether the change is safe to merge as-is. End with the required final report specified in `AGENTS.md`.

## Audits

Store completed written audits under `docs-dev/reviews/audits/`.
