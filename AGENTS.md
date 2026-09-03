## Context Resolution
Walk upward from this repository until you find the first directory containing `CONTEXT-ROOT.yaml`. That directory is the inherited context root.

Load `AGENTS.md` files in order from the root down through each ancestor directory, then apply this repository's own `AGENTS.md` last. If the marker file cannot be found, report that inherited context could not be resolved.

Collect tags from the `## Tags` section of every loaded `AGENTS.md` (ancestors and this file) and merge them -- these are this repo's effective tags. At each ancestor level, check for a `.knowledge/` directory using `ls` (not glob -- dot-prefixed directories are hidden from glob tools). If it exists, read the front matter of each file inside it. If a knowledge file has a `tags` field, load it only if any of its tags overlap with the effective tags. If a knowledge file has no `tags` field, load it unconditionally -- it applies to all repos at that level. Within matched files, use `keywords` for further task-specific filtering.

IMPORTANT: When the developer asks to add a rule, add guidance, add knowledge, add a tag, or document a pattern -- STOP and read the `skills/` directory at the context root BEFORE taking any action. Do not create tool-specific files (e.g., `.claude/rules/`), do not append to coding standards files, and do not modify files outside this repository. The skills define the exact workflow: `add-rule` for brief rules in AGENTS.md, `add-knowledge` for detailed knowledge files in `.knowledge/` folders, `add-tag` for tags in AGENTS.md. Always ask the developer which level in the hierarchy the change should apply to.

# ai-search-components

## Tags

typescript, react, vite, storybook, tailwindcss, vitest, eslint, npm, ai-search, component-library

## Guidance

The published front-end component library for AI Search. Consumed by `ai-search/demo-ui` and by client sites; it is the one Insytful repo that is public on GitHub (`contensis` org), so treat every change as externally visible. Upstream project name is `insytful-ai-search-components` (GitHub `contensis` org) — the local folder is normalised.

## Overrides

Record any deviations from inherited conventions here and explain why.