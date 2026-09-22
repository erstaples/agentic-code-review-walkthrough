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

Then **pin it**. Run `git rev-parse --verify <ref>^{commit}` on both ends and
carry the resulting SHAs for the rest of the tour, keeping the human-readable
names for display. For a tour of uncommitted work, use the literal head sha
`"WORKTREE"`.

Pinning is what keeps a commit, rebase, or checkout during the tour from
silently repointing a stop you have already narrated.

If the diff is empty, report that and stop.

### 1b. Preflight the editor bridge

Call `tour_status`. On success, run a **driven tour**: the editor opens and
highlights code as you narrate. On failure, say in one line which capabilities
are unavailable and how to install the extension, then run a **text tour** —
identical narration, `path:line` citations only. Never block the tour on the
bridge.

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

Build the full stop list before narrating, then present a compact agenda: the
problem and intended outcome, each stop's label and type, which stops are
foundational versus supporting, and which carry risk or uncertainty. Defer each
stop's detail until you reach it.

Stop types: `context`, `implementation`, `risk`, `evidence`, `limitation`.

### 4. Narrate one stop at a time

In a driven tour, call `tour_stop` before narrating, passing the pinned `base`
and `head` on every call. Use `mode: "diff"` when touring committed work — the
stop renders as a real side-by-side diff — and `mode: "file"` when touring the
working tree. Anchor ranges with `side: "head"` for added or changed code,
`side: "base"` for code that was deleted, and `side: "working"` only in file
mode.

Then `tour_focus` as you zoom into a specific construct. Do not call
`tour_stop` again mid-stop; that is what `tour_focus` is for.

If `tour_stop` returns a non-empty `deferred` list, those files have not been
highlighted yet — the diff editor materializes them on scroll. Do not claim to
be pointing at code in a deferred file.

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

End a driven tour with `tour_clear`.

## Constraints

- Never edit files, run `git add`/`commit`, or post review comments — this
  skill only narrates.
- In a driven tour, cite `<path>:<line>` for stop headers, jumps to code
  outside the current stop, answers worth revisiting, and the close-out. The
  editor carries moment-to-moment pointing. In a text tour, cite every file,
  function, type, or construct you name, since citations are the only
  navigation available. Use `<path>:<start>-<end>` for a range. Paths are
  relative to the repository root, not the module, so they resolve from the
  reviewer's working directory. The terminal renders them clickable, so a bare
  name costs the reviewer a search.
- Don't pad stops to hit a target count, and don't merge unrelated changes
  into one stop just to shorten the tour.
- If a "concern" is really just a style preference with no rule behind it,
  say so plainly rather than dressing it up as a violation.
- If the reviewer interrupts with a question that the current stop's context
  doesn't answer, read whatever's needed to answer it rather than guessing.
