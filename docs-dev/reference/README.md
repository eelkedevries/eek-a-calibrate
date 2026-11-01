# reference

Technical reference material used during development: API notes, library notes, external sources, and project-specific background.

Reference specific files from prompts rather than copying long context into prompt files. Do not include this folder in the deployed build output. If the repository is public this material is visible, so keep secrets and credentials out of it.

## Subfolders

- `primary_authoritative/` — the project's binding canon: specifications, locked decisions, schemas, naming and domain rules. The agent must treat it as ground truth and never contradict it. Keep it small and curated.
- `secondary_background/` — relevant but non-binding material: examples, context, and prior art. Informational only.

See `AGENTS.md`.
