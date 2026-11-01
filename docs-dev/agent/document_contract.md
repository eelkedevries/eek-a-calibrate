# Document contract

The documents this project can hold, what each is for, and what you must provide to author it.

**Hand this file to a doc-authoring assistant** (e.g. a custom ChatGPT) as its target spec: its job is to turn your loose notes into these files, filled to these shapes, at these exact paths. Fill only what you have — empty or optional documents are fine, and an unfilled section means "not yet decided", not a constraint. Ready-to-paste instructions for that assistant are in `gpt_author_instructions.md`.

Conventions: paths and filenames are exact. **Binding** means the coding agent treats the document as ground truth (see `AGENTS.md`).

## Files to produce (at a glance)

- `docs-dev/reference/primary_authoritative/specification.md` — binding design spec (main one)
- `docs-dev/reference/secondary_background/overview.md` — plain-language overview
- the `## Project conventions` block in `AGENTS.md` — operating rules
- `content/**` — structured data, if the project has it
- `docs-dev/reference/secondary_background/*` — optional extra reference material

Not produced here: prompt files (you describe tasks; the coding agent drafts them) and `current_state.md` (the agent maintains it).

## Documents

### Specification — the binding design canon
- **Path:** `docs-dev/reference/primary_authoritative/specification.md`
- **Binding:** yes ("when the code and this document conflict, this document is correct")
- **Required:** recommended for any real project; optional for a tiny experiment
- **Sections to fill:** Scope · Architecture · Data schemas · Domain rules · Naming and voice · Locked decisions. Keep the `Version` / `Last updated` header and bump it on changes.
- **You provide:** the design decisions, data shapes/schemas, hard constraints, and naming/voice rules you have settled.

### Overview — non-binding orientation
- **Path:** `docs-dev/reference/secondary_background/overview.md`
- **Binding:** no
- **Required:** optional (recommended)
- **Shape:** prose — what the project is, how it works at a high level, who it is for, scope and platforms.
- **You provide:** a plain-language description or pitch.

### Project conventions — operating rules
- **Path:** the `## Project conventions` section of `AGENTS.md`
- **Binding:** yes (the agent follows them)
- **You provide** (leave a line blank to keep the default): Language/locale · Workflow (commit/branch/push) · Verify command · Testing policy · Deploy base path.

### Current state — living orientation
- **Path:** `docs-dev/planning/current_state.md`
- **Binding:** no
- **Required:** optional; for a fresh project leave the shipped stub — the agent maintains it.
- **You provide:** only existing progress/state notes worth seeding.

### Reference material — non-binding background
- **Path:** `docs-dev/reference/secondary_background/` (one file per topic)
- **Binding:** no
- **You provide:** examples, prior art, or research notes the agent may consult.

### Content / data
- **Path:** the project's `content/` (or `data/`)
- **Binding:** it is application data, not documentation; its schema is defined in the specification.
- **You provide:** structured content files (YAML/JSON/CSV) that match the spec's schema exactly.

### Prompts — the work queue
- **Path:** `docs-dev/agent/prompts/NNN_short_name.md`
- **Required:** usually not pre-authored — you describe tasks and the agent drafts the prompts.
- **You provide:** only an existing task breakdown, if you have one.

## Output rules for the authoring assistant

- Use the exact paths and filenames above; do not invent files outside this contract.
- Fill the named sections; leave a brief placeholder where something is undecided.
- Apply the project's language/locale convention (e.g. British English) if one is set.
- For content/data, match the schema in the specification exactly.
- Keep binding documents (specification, conventions) precise and free of speculation; put non-binding context in the overview or reference material.
