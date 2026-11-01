# How to use this project

A short map of how the workflow fits together. Read this first.

## The daily loop

Three actions cover almost everything:

1. **Describe what you want** — tell the agent in plain language ("add a title screen with a start button"). It drafts a numbered prompt file in `docs-dev/agent/prompts/` and shows it for your approval. (Prefer to write it yourself? `bash scripts/new-prompt.sh <short_name>` scaffolds the next one.) For a big goal, ask the agent to propose a *plan* — a numbered sequence of small prompts — and approve that first.
2. **Run a prompt** — tell the agent "run prompt 003". It does exactly that work and commits it to `main` with the prompt filename as the message.
3. **Review** — preview the result (run/open the app) and skim the diff, then move to the next prompt.

## Map of the pieces

| File / folder | What it is | Who edits it |
|---|---|---|
| `docs-dev/agent/prompts/NNN_*.md` | The work queue and audit trail — one narrow task each | You write them; the agent runs them |
| `docs-dev/reference/primary_authoritative/specification.md` | Binding canon: the design the project must follow | You (the agent proposes changes) |
| `docs-dev/reference/secondary_background/overview.md` | Non-binding orientation: what the project is | You |
| `docs-dev/planning/current_state.md` | Living "where we are now" | The agent maintains it |
| `AGENTS.md` | Concise agent rules + project conventions | You set conventions once |
| `docs/` | User-facing documentation, safe to publish | You |
| source code | The project itself | The agent, via prompts |

Rule of thumb: **prompts and conventions are yours; the spec is the truth the agent obeys; current_state is the agent's running summary.**

## How much of this do I need?

Right-size to the project:

- **Minimal** (small experiment): just `overview.md` + prompts. Skip the spec, background, and conventions until you need them.
- **Full** (real project): fill the `specification.md` as decisions lock in, record conventions in `AGENTS.md`, and let `current_state.md` track progress.

Empty stub files are fine — they mean "not decided yet", not "broken". Don't add structure you aren't using.

## A worked example

```
You:   Run prompt 002 (002_core_maths.md)
Agent: Plan — add src/core/maths/* and src/core/filters/* with their unit
       tests; not touching the contracts or any other work package's files.
       [makes the change] [runs the verify command + the prompt's checks]
       Committed `002_core_maths.md` to main and pushed.
       <five-section final report>
You:   [review the diff] Looks good — run prompt 003.
```

If a prompt turns out too broad, the agent stops and asks you to split it rather than committing half-done work. To change something already shipped, write a superseding or revert prompt (see `prompt_iteration_guide.md`).

## How it builds (orientation)

If the stack is new to you, the moving parts are small: the build tool compiles the source into a `dist/` folder, and a workflow in the eelkedevries.com repository copies `dist/` to the web host when it is started (`npm run deploy`; see `docs/deployment.md`). A push alone does not deploy. The **verify command** (set in `AGENTS.md` Project conventions, e.g. `npm run check`) is the gate that must pass before a commit. Builds use the committed lockfile (`npm ci`, not `npm install`) so they're reproducible — the same way you'd pin an R or conda environment. CI re-runs the build, verify, and a secret scan on every push, so a broken or leaky commit is caught automatically.

## More detail

- Writing good prompts: `prompt_authoring_guide.md`
- Exactly how a prompt is run: `prompt_execution_guide.md`
- Fixing or reverting a prompt: `prompt_iteration_guide.md`
- What documents the project expects (and what to give a doc-authoring assistant): `document_contract.md`
- Instructions for setting up that assistant (a custom GPT): `gpt_author_instructions.md`
- The rules the agent always follows: `../../AGENTS.md`
