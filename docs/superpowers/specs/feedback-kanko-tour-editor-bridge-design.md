# Product feedback: `kanko-tour` editor bridge design

> Historical design document. Names and links follow current Kankō branding,
> but implementation sketches describe the original design. For current setup
> and interfaces, use the [repository README](../../../README.md).

Date: 2026-09-21

Reviewed artifacts:

- [`kanko-tour: editor bridge design`](2026-09-21-kanko-tour-editor-bridge-design.md)
- [Current `kanko-tour` skill](../../../skills/kanko-tour/SKILL.md)

## Executive summary

The design is a strong editor-control bridge, but it is not yet a complete
specification for the product vision.

It convincingly solves this problem:

> The agent can drive VS Code while explaining a diff.

It does not yet solve the larger problem:

> The reviewer leaves with enough understanding, evidence, and recorded
> decisions to safely approve and maintain agent-authored code.

That distinction matters. A polished, agent-driven tour could actually make
passive reviewing easier: the narration sounds coherent, the screen moves
automatically, and the reviewer mistakes fluency for understanding. The design
currently optimizes navigation and presentation without defining how the
product establishes comprehension, review coverage, or ownership.

The editor bridge is worth building. It should be positioned as the first
enabling layer of a larger walkthrough product, not as the whole experience.
The product's defensible value is not that an agent can highlight code. It is a
closed-loop handoff:

> intent -> guided understanding -> interrogation -> evidence -> recorded
> decisions -> explicit ownership

## What the current design gets right

The design contains several strong foundations for an over-the-shoulder
walkthrough:

- It groups the diff into logical, commit-message-worthy changes rather than
  presenting files or hunks mechanically.
- It gives the presenter control of visual attention while preserving the
  reviewer's ability to interrupt.
- It separates a broad stop highlight from a narrower focus highlight. That
  reflects how a human presenter first establishes a scene and then points at
  particular details.
- It treats the reviewer's selection as a backchannel for deictic questions
  such as "what is this?" or "why here?"
- It keeps source-code mutation out of the bridge.
- It requires the agent to inspect full files and repository context instead
  of narrating isolated diff hunks.
- It distinguishes stated rationale from inferred rationale.
- It retains durable `path:line` references in addition to transient editor
  highlights.
- Its architecture is narrowly scoped, locally authenticated, and separable
  from the reasoning performed by the skill.

These decisions solve a real usability problem. The agent should be able to
manage visual attention instead of repeatedly telling the reviewer which link
to click.

## What an actual walkthrough contains

A human screenshare walkthrough is not just a sequence of code locations. It
usually has at least seven phases:

| Phase | Desired reviewer experience | Current coverage |
|---|---|---|
| Frame | Understand the problem, intended behavior, constraints, and non-goals | Weak; mostly reconstructed from commits and code |
| Map | See the route, major concepts, risk areas, and expected depth | Explicitly hidden |
| Walk | Follow control flow, data flow, and logical changes | Strong |
| Interrogate | Redirect the author, inspect callers, tests, history, and alternatives | Limited to selection-based questions |
| Validate | See tests, diagnostics, runtime behavior, failure paths, and blast radius | Missing |
| Close | Record decisions, concerns, open questions, and what was reviewed | Limited to a prose summary |
| Own | Be able to explain and safely modify the system later | Not established or measured |

The current spec is therefore strongest in the middle of the experience. It
needs explicit product behavior before and after the code tour, as well as a
richer review loop during each stop.

## Product outcome and completion criteria

The current goals are editor operations: open code, display diffs, focus
ranges, and read selections. Those are capabilities, not user outcomes.

The spec should add a product-level goal similar to:

> At completion, the reviewer understands the behavioral change,
> architectural path, important invariants, risks, verification evidence, and
> remaining uncertainty well enough to approve, reject, or maintain it.

A completed tour should leave the reviewer able to answer:

- What user- or system-visible behavior changed?
- Where does the affected flow enter and leave the system?
- What are the key invariants and failure modes?
- What evidence demonstrates that the new behavior works?
- What remains uncertain, untested, or deliberately deferred?
- Where would the reviewer make the next likely modification?

No walkthrough can prove comprehension. It can, however, make skipped areas,
unresolved uncertainty, and weak evidence explicit. "The agent reached the
last stop" must not be treated as equivalent to "the review is complete."

## Highest-priority additions

### 1. Show the tour map and progress

The current skill builds the stop list silently, and the bridge spec defers a
reviewer-facing stop list. That removes context and agency from the person who
is supposed to be reviewing the work.

Before beginning, show a compact agenda containing:

- The problem and intended outcome.
- The stops and current position.
- Which stops are foundational and which are supporting detail.
- High-risk or high-uncertainty stops.
- A rough indication of tour depth or size.
- Reviewed, skipped, questioned, and unresolved state.

The agent can still drive by default. "Author-driven" should mean that the
reviewer does not have to perform routine navigation; it should not mean that
the reviewer lacks a map, cannot jump, or cannot regain control.

At minimum, the interaction model should include overview, next, back, jump,
skip, pause, resume, and return-to-question. A sidebar is only one possible UI
for this. Deferring the sidebar is reasonable; deferring reviewer navigation
and progress state is not.

### 2. Add a review ledger and final review receipt

The design's "no write path" combines two separate promises:

1. The bridge never modifies source code.
2. The walkthrough never records review state.

The first is a valuable invariant. The second leaves important functionality
on the table.

During a tour, record locally:

- Stops visited, skipped, or only partially covered.
- Reviewer questions and the answers given.
- Concerns and their current disposition.
- Assumptions and inferred rationale.
- Requested follow-up work.
- Verification evidence examined.
- Files, behaviors, or risks that remain unreviewed.

At completion, generate a review receipt that summarizes this state. The
receipt could remain local or be exported. Posting it to a PR, creating review
comments, or changing remote state should remain a separate, explicitly
authorized action.

The closeout should distinguish at least:

- Understood and reviewed.
- Reviewed with a concern.
- Deferred by the reviewer.
- Not covered.
- Blocked by missing evidence or context.

This turns the tour from an ephemeral conversation into an auditable handoff.

### 3. Make evidence a first-class part of the tour

Static code explanation alone cannot close the trust gap. A human author
sharing their screen commonly shows more than a diff:

- The failing behavior before and corrected behavior after.
- Tests tied to the changed behavior.
- Type-check, lint, build, and diagnostic results.
- Runtime logs, traces, screenshots, or UI behavior.
- Callers, consumers, and downstream effects.
- Migration, compatibility, rollout, rollback, and operational consequences.
- Important paths deliberately left unchanged.

The tour model should support different kinds of stops, for example:

- Context or problem framing.
- End-to-end behavioral path.
- Implementation decision.
- Invariant or risk.
- Verification evidence.
- Known limitation or deferred work.

Evidence should be connected to the claim it supports. "Tests passed" is much
weaker than showing which test demonstrates which behavior or invariant.

### 4. Preserve rationale from the original coding session

The skill currently reconstructs "why" from commit messages, comments, and
the resulting code. It correctly labels inference, but a reconstructed
rationale is fundamentally weaker than author knowledge.

This is especially important for agent-generated changes. The agent conducting
the tour may not be the same invocation that made the change. Without durable
session context, the presenter is effectively reverse-engineering another
agent's work and may produce a plausible but false explanation.

The larger product should ingest or produce a small provenance artifact with:

- The original request and acceptance criteria.
- User-supplied constraints and non-goals.
- Important design decisions.
- Rejected alternatives and why they were rejected.
- Assumptions made by the coding agent.
- Tests and checks performed during implementation.
- Known failures, uncertainty, and deliberately omitted scope.

Every rationale presented in the tour should be attributable as one of:

- Stated by the user or specification.
- Recorded by the coding agent during implementation.
- Evident from repository documentation or history.
- Reconstructed by the presenting agent.

That provenance distinction is essential for trust.

### 5. Combine explanation with adversarial review

The current skill says that it explains and contextualizes rather than hunting
for bugs. A separate deep code-review workflow can still be useful, but the
product should not force the human to mentally reconcile two disconnected
sessions.

Each stop should surface the review information relevant to that part of the
change:

- Intended behavior.
- Verification evidence.
- Correctness, security, performance, compatibility, and operability risks.
- Subtle invariants.
- Reasonable alternatives and tradeoffs.
- Agent uncertainty or weakly supported claims.
- Findings from any prior automated or human review.

The current "concerns" guidance leans heavily toward repository-convention
violations. That is too narrow for the stated vision. Convention mismatches
matter, but so do behavior, failure handling, observability, migration safety,
and maintainability.

The tour does not need to become a full static-analysis product. It does need
to present known risks and findings in context rather than treating review and
understanding as unrelated activities.

### 6. Add a lightweight ownership check

A passive sequence of "next" commands recreates the review failure the product
is intended to prevent. The tour should occasionally invite active reasoning,
especially at the end.

Useful prompts include:

- Trace one representative request through the new flow.
- Identify where a central policy or threshold would be changed later.
- Explain what happens when a dependency fails.
- Identify the test that demonstrates the most important invariant.
- Choose which area should be revisited before approval.

This should be adaptive and respectful, not a mandatory quiz after every stop.
If the answer reveals a gap, the agent should return to the relevant stop or
show additional evidence.

### 7. Reduce split attention between terminal and editor

The design moves the code into VS Code but leaves the full narration in the
terminal. That is not equivalent to a human screenshare, where the reviewer can
keep their eyes on the code while listening.

The editor should display at least:

- The stop title and short purpose.
- Current progress.
- A concise explanation tied to the focused range.
- Open questions or concerns.
- Controls for next, back, pause, resume, and ask-about-selection.

Inline `after` text is useful for a short pointing note, but it is not an
adequate narration surface. Native comment threads, a compact view, or a
virtual document could keep explanation adjacent to the code without changing
source files. Spoken narration could be explored later, but is not required
for a valuable first release.

### 8. Support interruption and resumption as first-class behavior

Large AI-authored changes are exactly the reviews most likely to span multiple
sessions. The product should preserve:

- Current stop and focus.
- Completed, skipped, and unresolved stops.
- Questions and concerns.
- The exact diff identity.
- Any changes made to the branch since the tour began.

On resume, it should report drift before continuing. Reconstructing the tour
from scratch risks changing the explanation and losing review state.

## Product choices to reconsider

### No graceful degradation

Refusing to start when the extension is unavailable creates avoidable
activation friction and makes the skill less robust in SSH, container, CI, or
unsupported-editor environments.

Recommended behavior:

- Use the driven-editor experience when the bridge is healthy.
- Fall back to a text-and-links tour when it is not.
- Clearly state which interactive capabilities are unavailable.
- Offer a concise installation or repair path.

The premium experience can require VS Code without making the underlying
review workflow unavailable.

### No reviewer-facing navigation

Reviewer-driven navigation need not replace agent-driven presentation, but it
should not be treated merely as a later convenience. It is part of reviewer
agency, orientation, accessibility, and recovery from interruptions.

### No write path

Rewrite this non-goal as:

> The bridge never modifies repository source or configuration as part of a
> tour.

That leaves room for ephemeral decorations, local review state, comment
threads, bookmarks, and exportable review receipts.

### Ask the user to choose the diff every time

The skill should inspect the repository and propose the likely review range,
including the exact resolved revisions. Ask only when the range is ambiguous
or the user wants something else. Requiring every reviewer to formulate a git
range adds friction without improving safety.

### Hide the complete stop list

Replace this with progressive disclosure: show titles, risks, and progress up
front, but defer each stop's detailed narration until it is reached.

### Cite every symbol on every mention

The current citation rule is too absolute and will make spoken-style
narration repetitive. With driven editor focus, citations should be required
for:

- Stop headers.
- Important transitions to code outside the visible stop.
- Answers that the reviewer may revisit later.
- The final review receipt.

The editor should carry moment-to-moment pointing. The transcript should carry
durable references where they add retrieval value.

## Product-critical protocol concerns

These are implementation-shaped issues, but each can directly damage reviewer
trust and therefore belongs in the product review.

### Diff coordinates are ambiguous

`tour_focus` identifies a path and line range but not the side or revision of a
diff. For modified and deleted code, the same line number can refer to
different content on the base and head sides.

The focus model must identify whether it targets:

- Base.
- Head.
- Working tree.

It should also pin immutable commit IDs rather than retain moving names such as
`main` and `HEAD`. If the branch or working tree changes, the product should
detect drift and pause or rebuild the tour. A walkthrough that points at the
wrong code loses credibility immediately.

Content- or symbol-based anchors could later make tours more resilient, but
unambiguous revision and side identity are required from the beginning.

### Empty selections are too limiting

Reviewers will often place a cursor, scroll to a region, or say "this function"
without selecting exact lines. Question context should be able to include:

- Active file and revision side.
- Cursor location.
- Current symbol, when available.
- Visible ranges.
- Explicit selection, when present.
- Current tour stop and focus.

The user should not need to carefully highlight code before every question.

### Arbitrary ten-line context is not semantic context

Ten lines before and after a selection may be useful as a fast path, but the
skill should still inspect definitions, callers, tests, documentation, or
history when those are necessary to answer. The protocol should not encourage
the model to treat proximity as complete context.

### Dirty working trees and changing refs need explicit semantics

The design supports `base` and `head` for diff mode and normal files for file
mode, but a tour of uncommitted work needs a stable before/after identity too.
The product needs to define whether it snapshots dirty content, refuses when
content changes, or continually re-resolves the tour. Silent drift is not
acceptable.

### Large stops are a product failure, not only a tab-count problem

A stop containing dozens of files indicates that either:

- The conceptual unit is too broad.
- The change is dominated by generated/mechanical edits.
- The tour needs a summary-plus-sampling strategy.

Do not solve this only with a tab cap. Classify bulk changes, explain their
generation or transformation, inspect representative examples, and preserve a
way to verify complete coverage.

## Feedback on the current skill

The existing skill is a good concise behavioral entrypoint. It should remain
focused on orchestration rather than absorbing HTTP details or extension
internals.

Strong elements to retain:

- Read full files and relevant repository guidance.
- Group by logical change rather than by file.
- Pause between stops.
- Answer interruptions by reading additional context instead of guessing.
- Label inferred rationale.
- Avoid manufacturing concerns.

Changes recommended for the skill itself:

- Generalize the voice from a named individual, as the spec already proposes.
- Propose a detected diff range instead of always asking the user to supply it.
- Present a compact agenda instead of keeping the stop list silent.
- Ask what level of depth the reviewer wants, or infer it from their behavior
  and allow adjustment during the tour.
- Introduce stop types and risk/evidence metadata.
- Pull in implementation-session provenance when available.
- Incorporate existing review findings into the relevant stops.
- Track questions, concerns, skipped material, and verification state.
- Include a lightweight ownership check and review receipt at closeout.
- Relax the every-symbol citation rule.
- Fall back cleanly when the editor bridge is unavailable.

As the skill grows, keep conditional or editor-specific procedures in
supporting references. The main `SKILL.md` should communicate outcomes,
decision criteria, essential constraints, and tool routing without becoming a
copy of the bridge protocol.

## Recommended release scope

### Required for a credible first product release

1. Editor-driven stop and focus behavior.
2. A visible agenda with progress and reviewer control.
3. Immutable diff identity and unambiguous base/head/working-tree anchors.
4. Context, implementation, risk, and evidence stop types.
5. Local question, concern, and review state.
6. Pause and resume support with drift detection.
7. A final receipt covering reviewed, skipped, unresolved, and verified items.
8. Clear rationale provenance: stated, recorded, repository-derived, or
   reconstructed.
9. A text-and-links fallback when the editor bridge is unavailable.

### Valuable next capabilities

- Capture a structured provenance artifact during the original coding session.
- Editor-native comment threads for questions and decisions.
- Optional publication of the review receipt to GitHub or GitLab.
- Test, diagnostics, runtime, and UI demonstration stops.
- Adaptive tour depth based on reviewer familiarity and questions.
- Lightweight ownership checks and targeted recap.
- Generated-change summarization with representative sampling.
- Multi-reviewer handoff and shared review state.
- Additional editor adapters behind an editor-neutral tour protocol.

### Reasonable later work

- Spoken narration synchronized with editor focus.
- Rich architectural diagrams generated for a tour.
- Long-term team knowledge maps derived from completed tours.
- Analytics relating tour coverage to later defects or maintenance questions.

## Success metrics and product validation

Do not evaluate the product primarily by whether the correct tabs opened or
whether users finished the tour. Those are implementation and engagement
metrics, not proof of value.

Useful evaluation dimensions include:

### Comprehension

- Can the reviewer accurately summarize the behavioral and architectural
  change after the tour?
- Can they identify the central invariant and likely failure modes?
- Can they locate where a future modification should be made?

### Review quality

- Are reviewers more likely to find seeded correctness, security, or
  operational issues?
- Are skipped areas and unresolved questions explicit?
- Do review comments become more specific and useful?

### Efficiency

- How long does it take to reach the first substantive question or finding?
- Does the tour reduce navigation and context-reconstruction time without
  reducing defect discovery?
- Can an interrupted reviewer resume without repeating work?

### Ownership after merge

- Does the code owner need fewer follow-up explanations?
- Can they make a subsequent change in the area more quickly and safely?
- Are design decisions and known limitations still discoverable weeks later?

The most informative early study would compare three conditions on real,
substantial agent-authored changes:

1. Ordinary diff review.
2. The current text-only `kanko-tour` skill.
3. The editor-driven, stateful walkthrough.

Measure comprehension, defect detection, time, unreviewed scope, confidence
calibration, and delayed recall. Self-reported confidence alone is dangerous
because a smooth narration may increase confidence without increasing actual
understanding.

## Prior-art implications

The existing spec is correct not to depend directly on CodeTour for the core
agent-driven bridge. However, CodeTour demonstrates several mature interaction
patterns worth borrowing: introductory content steps, visible current-step
state, previous/next navigation, resume, ref pinning, and drift handling.

GitHub's review experience similarly treats viewed state, progress, pending
comments, and a final submitted review as core parts of review rather than
optional decoration. The walkthrough should adopt those semantics even if it
does not initially integrate with GitHub.

VS Code already exposes suitable primitives for several proposed features:
Tree Views and status items for progress, comment threads for local discussion,
and the Testing API for evidence. These can preserve the source-read-only
invariant while making the review stateful and editor-native.

## Suggested reframing of the spec

Keep the current document, but narrow and clarify its title and promise:

> `kanko-tour`: VS Code editor bridge v1

Add a parent product spec covering:

- Target reviewer and change types.
- Intended review and ownership outcomes.
- Tour lifecycle and state model.
- Provenance and evidence model.
- Reviewer controls and accessibility.
- Review receipt and integration boundaries.
- Success metrics.

The bridge spec can then remain appropriately concrete about transport,
pairing, editor operations, and tests. The parent spec should own the larger
claim that the experience closes the human understanding gap created by
agentic coding.

## Bottom line

The current design removes navigation friction and creates the beginnings of a
convincing guided presentation. That is necessary, but not sufficient.

To realize the stated vision, the product must optimize for reviewer agency,
evidence, explicit coverage, rationale provenance, durable decisions, and
post-tour ownership. Otherwise it risks becoming a very polished way to
half-review code.

## References

- Alberto Bacchelli and Christian Bird, [*Expectations, Outcomes, and
  Challenges of Modern Code Review*](https://www.microsoft.com/en-us/research/wp-content/uploads/2016/02/ICSE%202013-codereview.pdf).
- Microsoft CodeTour, [project documentation](https://github.com/microsoft/codetour/blob/main/README.md).
- GitHub Docs, [*Reviewing proposed changes in a pull request*](https://docs.github.com/en/pull-requests/how-tos/review-pull-requests/reviewing-proposed-changes-in-a-pull-request).
- Visual Studio Code, [Comment API reference](https://code.visualstudio.com/api/references/vscode-api).
- Visual Studio Code, [Testing API guide](https://code.visualstudio.com/api/extension-guides/testing).
- Visual Studio Code, [Tree View API guide](https://code.visualstudio.com/api/extension-guides/tree-view).
