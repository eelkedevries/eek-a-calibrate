# Prompt iteration guide

Use this guide when asked to supersede or revert a previously committed prompt.

## Supersede

1. Identify the original prompt file, e.g. `004_title_screen.md`.
2. Create a new prompt file with a letter suffix, e.g. `004b_title_screen_fix.md`.
3. Add a `Supersedes:` line near the top of the new prompt referencing the original filename.
4. Treat the new prompt as an ordinary prompt: narrow, with explicit required changes and acceptance criteria.
5. Run the new prompt following the standard execution rules (commit to `main`).

## Revert

1. Identify the commit hash of the prompt to be reverted.
2. Create a revert prompt file with the next available number, named `NNN_revert_<original_filename>.md`.
3. The prompt should instruct: run `git revert <commit-hash>` on `main`, commit with the revert prompt's filename as the commit message, and push.
4. Do not rewrite history. Do not force-push.

## Do not

- do not edit, rename, or delete the original prompt file;
- do not amend or rebase committed prompt commits on `main`;
- do not force-push `main`.
