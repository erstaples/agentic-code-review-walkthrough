---
name: tour-changes
description: Interactively walk the reviewer through a diff, one logical change at a time, narrating what changed, why, and how it connects to the rest of the code, flagging anything that looks off against repo conventions along the way. Use when the user says "tour the changes", "walk me through this diff", "guide me through what changed", "/tour-changes", or asks for a guided review of a diff/PR/branch rather than reading it themselves.
---

# Tour the changes

A large diff is hard to review cold. This skill plays the role of the engineer
who wrote the change, walking the reviewer through it stop by stop the way
they would in person — narrate, pause, take questions, move on. It explains
and contextualizes rather than hunting for bugs as its primary job, though it
flags real concerns when it sees them.

## Workflow

### 1. Establish the diff range

Inspect the repository and propose the likely review range rather than asking
the reviewer to formulate one. Common shapes: current branch vs the default
branch, working tree vs `HEAD`, a commit range, or a fetched MR/PR. State the
resolved `git diff` command and proceed unless corrected.

If the diff is empty, report that and stop.

### 2. Read for context, not just the diff

Read full changed files, not just hunks — grouping and narration both need
context a hunk alone won't show. Check recent commit messages on the range
(`git log`) for stated intent. Skim any AGENTS.md/CLAUDE.md/module docs
relevant to the touched paths so conventions are fresh before judging anything.

### 3. Group into stops

A stop is one logical, commit-message-worthy change — not one file and not one
hunk. A rename that touches five files is one stop. A file with two unrelated
changes is two stops. Order stops so dependencies come first (e.g. a new type
before the code that uses it) and related stops stay adjacent.

Build the full stop list before narrating the first one, so the tour has a
known shape (silently — don't dump the list on the reviewer up front, that's
the narration's job).

### 4. Narrate one stop at a time

For each stop, cover:
- **What changed** — concise, not a restatement of the diff the reviewer can
  already see.
- **Why** — inferred from commit messages, comments, or how it connects to
  other stops. Say when this is inference vs. stated intent.
- **How it connects** — to other stops in this tour, or to existing code
  elsewhere that isn't part of the diff.
- **Worth spotlighting** — non-obvious logic, subtle invariants, anything that
  would take the reviewer a while to notice unassisted.
- **Concerns, if genuine** — violations of repo conventions (hand-edited
  generated files, comment-discipline violations, missing regeneration step,
  deviation from established patterns nearby). Only raise it if it's actually
  there. Don't manufacture a concern to fill the section.

Then **stop and wait**. The reviewer may ask a question, ask for more depth,
say "next", "back", or jump to a named stop. Don't advance without one of
these.

### 5. Close out

After the last stop, give a short closing summary: the overall shape of the
change (what problem it solves end to end), and a roll-up of any concerns
flagged along the way. Don't repeat the per-stop narration.

## Constraints

- Never edit files, run `git add`/`commit`, or post review comments — this
  skill only narrates.
- Cite code as `<path>:<line>` every time you name a file, function, type, or
  construct — `<path>:<start>-<end>` for a range. Paths are relative to the
  repository root, not the module, so they resolve from the reviewer's working
  directory. This holds everywhere: every part of a stop, the close-out, answers
  to the reviewer's questions, and references to code outside the diff. The
  terminal renders them clickable, so a bare name costs the reviewer a search.
- Don't pad stops to hit a target count, and don't merge unrelated changes
  into one stop just to shorten the tour.
- If a "concern" is really just a style preference with no rule behind it,
  say so plainly rather than dressing it up as a violation.
- If the reviewer interrupts with a question that the current stop's context
  doesn't answer, read whatever's needed to answer it rather than guessing.
