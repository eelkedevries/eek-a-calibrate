# Agent instructions

Concise root rules for Claude Code and Codex. Detailed procedures live in the guides under `docs-dev/agent/` — start with `docs-dev/agent/how_to_use.md`. These rules guide behaviour but do not enforce it; safety also relies on checks, hooks, and review.

## Core principles

- One prompt = one reviewable unit. Do only what the prompt or request says; prefer the smallest correct change. No unrequested features, frameworks, tests, or architecture.
- Before editing, briefly state intended files, planned changes, and out-of-scope items.

## Turning intent into prompts

Prompts need not be hand-written. When the user describes a task in plain language, draft the prompt file for them, show the draft, and run it only on approval. For a large or vague goal, first propose a numbered sequence of small prompts and get approval before running any. `scripts/new-prompt.sh <short_name>` scaffolds a prompt manually if preferred.

## Where things live

- `docs-dev/agent/prompts/` — numbered prompt files (work queue and audit trail).
- `docs-dev/agent/` — guides: `how_to_use`, `prompt_authoring_guide`, `prompt_execution_guide`, `prompt_iteration_guide`, `document_contract`, `gpt_author_instructions`.
- `docs-dev/reference/primary_authoritative/specification.md` — binding canon (ground truth).
- `docs-dev/reference/secondary_background/` — non-binding context and examples.
- `docs-dev/planning/current_state.md` — living "where we are"; read at session start.
- `docs-dev/plan.md` — the v1 plan: decisions, prompt sequence, later work.
- `docs/` — user-facing, publishable docs.

If the repository is public, everything in it — including `docs-dev/` — is publicly visible. Never put secrets, tokens, or `.env*` files in the repository. `docs-dev/` must never reach the deployed build output (see `scripts/check-public-build.sh`).

## Ground truth

Treat `primary_authoritative/specification.md` as correct. Never contradict it; if a change would conflict, stop and flag it. Empty or stubbed sections mean "not yet decided" — no constraint. When a decision changes, update the spec and bump its version. `secondary_background/` is informational only.

Update `current_state.md` when a prompt adds a system or a key decision — for genuinely useful orientation, not after routine commits.

## Running and committing (commit-to-`main`)

Default workflow (see `prompt_execution_guide.md` for the full steps):

- Run a prompt: clean tree on `main` → make only that change → run the verify command (Project conventions) and the prompt's checks → if they pass, commit to `main` and push. One commit per prompt; no branch, no PR.
- **Commit messages:** prompt work uses the exact prompt filename; any other commit uses a conventional prefix (`feat:`, `fix:`, `docs:`, `refactor:`).
- Do not commit partial or failing work unless a WIP commit is requested. Do not rewrite history or force-push.

## Project conventions

Recorded at setup; these override the defaults above where they differ.

- **Language / locale:** British English in code, comments, and user-facing text.
- **Workflow:** commit and push directly to `main`; no feature branches or pull requests unless explicitly requested. Run `git pull --rebase` before pushing; never force-push.
- **Verify command:** `npm run check` (build, unit tests, asset and URL checks, public-build check, prompt numbering). `npm run check:all` adds the Playwright end-to-end tests.
- **Testing policy:** tests as the specification lays them out (§10): unit tests (`node --test` on the TypeScript sources), simulation and parity tests, Playwright end-to-end specs, and the build checks. Each work package writes the tests its prompt names; no others unless a prompt asks.
- **Deploy base path:** `/eek-a-calibrate/`
- **Hosting:** `https://eelkedevries.com/eek-a-calibrate/` on SiteGround, deployed by the `deploy-eek-a-calibrate.yml` workflow in `eelkedevries/eelkedevries.com`, which already holds the SSH secrets. Not GitHub Pages. This repository stores no secrets.
- **Deploy:** a push does not deploy. After pushing a change to the built site, run `npm run deploy` (it re-runs connection time-outs itself), or start the workflow through the GitHub API or its *Run workflow* button where `gh` is not available, and include the live check in the final report (see `docs/deployment.md`).

### Project-specific rules

- Treat `docs-dev/reference/primary_authoritative/specification.md` as binding canon. The contracts in its §6 (`src/core/types.ts`, `src/engines/types.ts`, `src/vision/protocol.ts`), `src/core/constants.ts`, `package.json` and `package-lock.json` belong to prompt 001: changing them needs an explicit note in the report and a specification version bump.
- Each work package touches only the files it owns (specification §5 and §11, repeated in its prompt file).
- **Anti-fabrication:** no accuracy figure, benchmark or citation appears in the UI or docs unless it carries a real, checkable source (specification Appendix B) or is labelled heuristic. No accuracy figure for this app is published until the manual checks with a real webcam have been done.
- **Privacy:** everything runs on the device. No request may leave the origin (the CSP enforces `connect-src 'self'`, `scripts/verify-assets.mjs` checks the build, and the smoke test checks the browser). No images or video are ever stored.
- **Verification deferral:** only a check that genuinely needs a real camera or a person may be deferred, and it goes on the manual checklist (`docs-dev/manual-verification.md`). The toolchain checks always run and pass.

## Supporting guides

`how_to_use.md` (map + daily loop), `prompt_authoring_guide.md` (writing prompts), `prompt_execution_guide.md` (running them), `prompt_iteration_guide.md` (supersede/revert), `document_contract.md` (what documents the project expects), `reviews/code_review_guide.md` (reviews).

## Final response

Every response must end with this five-section report:

### 1. Work done
`Completed successfully`, `Partially completed`, or `Not completed` — and whether all acceptance criteria were met. Cite the commit hash and the result of the verify command / checks as evidence.

### 2. Files changed
Every file added, modified, or deleted, one line each. `None.` if no changes.

### 3. Scope deviations
Any work outside the prompt's `Required changes`, with a reason. `None.` if scope was followed exactly.

### 4. Open issues
List issues, or `None.`

### 5. Human actions required
List required actions, or `None. You can proceed to the next prompt.`
