# Prompt authoring guide

Use this guide when creating new files in `docs-dev/agent/prompts/`. You can also draft a prompt from a user's plain-language request — write the structured prompt, then show it for approval before running.

## Naming

Prompt files must be numbered and briefly named:

- `001_setup.md`
- `002_title_screen.md`
- `003_github_pages.md`

Continue the existing numbering. Do not renumber old prompt files.

Use lowercase words separated by underscores.

Supersede prompts may use a letter suffix:

- `004b_title_screen_fix.md`

Do not rename prompt files after they have been run.

## Scope

Each prompt must describe one reviewable unit of work.

In this project each prompt also names the files it **owns** (specification §5 and §11). A
prompt changes only those files; the contracts, `src/core/constants.ts`, `package.json` and the
lock file belong to prompt 001.

A good prompt:
- is narrow and explicit;
- can be completed in one agent session;
- has clear acceptance criteria, stated as observable outcomes (what you can see or run) where possible, not only "tests pass";
- avoids broad milestones;
- avoids speculative architecture;
- states what not to implement when overreach is likely.

Avoid prompts such as:

- “Build the full MVP”
- “Implement the whole game framework”
- “Set up everything needed”
- “Continue until done”
- “Create all required systems”

Prefer prompts such as:

- “Create the initial Vite scaffold and contracts”
- “Add the grouped leave-one-out solver only”
- “Add the deploy workflow in the website repository”
- “Fix the MIME type of the precompressed WebAssembly”
- “Add one mapper candidate and its unit test”

## Background context

Prompt files may reference background files, but should not copy long background material inline. If context is needed, place it in `docs-dev/reference/` or `docs-dev/planning/` and reference only the specific file or section needed for the task.

## Required prompt structure

Each prompt file must contain only instructions intended for the coding agent.

Use this structure:

# Task: <short task name>

## Goal

<One-sentence goal.>

## Scope

Implement only the work described in this prompt. Do not implement adjacent systems or future prompts.

## Context

<Optional. Reference specific files only if needed. Keep this short.>

## Required changes

1. <Specific required change>
2. <Specific required change>
3. <Specific required change>

## Do not implement

Do not implement:
- <likely overreach>
- <likely overreach>
- <likely overreach>

## Acceptance criteria

The task is complete when:
- <criterion>
- <criterion>
- <criterion>

## Checks

Run the relevant checks for this prompt.

## Commit and push

If and only if the scope was followed and checks pass, create one commit on `main` using this file's exact filename as the commit message, then push.

Do not commit or push partially completed work unless explicitly instructed.

## Final report

End with the required final report specified in `AGENTS.md`.
