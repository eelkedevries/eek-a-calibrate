# Prompt execution guide

Use this guide when asked to run a prompt from `docs-dev/agent/prompts/`.

Work is committed directly to `main` — one commit per prompt, no per-prompt branch.

1. Resolve the requested prompt number to exactly one matching file.
2. Read the entire prompt file before editing.
3. Ensure the working tree is clean and on `main`.
4. Check `docs-dev/reference/primary_authoritative/specification.md` for anything relevant. If the prompt would conflict with the canon, stop and flag it.
5. Execute only that prompt — no later prompts, no follow-up work.
6. Run the project's verify command (the `Verify command` in `AGENTS.md` Project conventions, if set) and the prompt's stated checks. Where the result is visible (e.g. a web UI), preview it — run or open the app — to confirm the observable acceptance criteria, not just that checks pass.
7. If checks fail, do not commit; report the failure and stop.
8. If checks pass, commit to `main` using the exact prompt filename as the commit message — at most one commit.
9. Push unless the prompt or user explicitly says not to push.
10. Update `docs-dev/planning/current_state.md` if the prompt introduced a new system or a key decision.
11. For public website deployment, deploy only the generated build output, and only when the prompt explicitly requires deployment.
12. End with the required final report, citing the commit hash and the verify/checks result as evidence.

If the prompt is ambiguous, missing, or matches multiple files, stop and ask for clarification.

If checks fail, do not commit or push unless the user explicitly requests a WIP commit. Report which checks failed and what was attempted, then stop.

If a prompt turns out to be too broad mid-execution, stop, leave the working tree uncommitted, and report that the prompt should be split before re-running. Do not commit partial work to mask scope.

If a prompt fails after edits were made, leave the working tree unchanged for inspection unless the user asks to clean it up. The final report must state:

- whether there are uncommitted changes on `main`;
- checks attempted;
- cleanup options.

For superseding or reverting a previously committed prompt, follow `prompt_iteration_guide.md`.
