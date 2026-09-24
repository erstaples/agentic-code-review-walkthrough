# kanko-tour: product spec

> Historical design document. Names and links follow current Kankō branding,
> but implementation sketches describe the original design. For current setup
> and interfaces, use the [repository README](../../../README.md).

Date: 2026-09-21

**Status: stub.** This document records the product-level scope that the
[editor bridge v1 spec](2026-09-21-kanko-tour-editor-bridge-design.md)
deliberately does not own. It is not ready to implement from. It exists so the
deferred scope is recorded rather than lost, and so the bridge spec can stay
concrete about transport and editor operations.

## Why this document exists

The bridge spec solves a navigation problem: the agent can drive VS Code while
explaining a diff. That is necessary and not sufficient.

The failure mode it does not address is that a fluent, well-paced, automatically
scrolling tour can *increase reviewer confidence without increasing reviewer
understanding*. A polished walkthrough could make passive reviewing easier than
it already is. "The agent reached the last stop" must never be treated as
equivalent to "the review is complete."

## Product outcome

At completion, the reviewer understands the behavioral change, the
architectural path, the important invariants, the risks, the verification
evidence, and the remaining uncertainty well enough to approve, reject, or
maintain the change.

A completed tour should leave the reviewer able to answer:

- What user- or system-visible behavior changed?
- Where does the affected flow enter and leave the system?
- What are the key invariants and failure modes?
- What evidence demonstrates the new behavior works?
- What remains uncertain, untested, or deliberately deferred?
- Where would the next likely modification go?

No walkthrough can prove comprehension. It can make skipped areas, unresolved
questions, and weak evidence explicit.

## Phases of a walkthrough

| Phase | Reviewer experience | v1 bridge coverage |
|---|---|---|
| Frame | Problem, intended behavior, constraints, non-goals | Partial — reconstructed from commits and code |
| Map | Route, concepts, risk areas, expected depth | Terminal agenda |
| Walk | Control flow, data flow, logical changes | Strong |
| Interrogate | Redirect, inspect callers, tests, history, alternatives | Partial — `tour_context` plus ad-hoc reading |
| Validate | Tests, diagnostics, runtime behavior, blast radius | None |
| Close | Record decisions, concerns, open questions, coverage | Prose summary only |
| Own | Able to explain and safely modify later | Not established |

v1 is strongest in the middle. This spec owns the ends.

## Scope

### Tour state and lifecycle

**Partially in v1.** Mid-review edits pulled a minimal in-session ledger into
the bridge spec: stops covered, questions and answers, concerns and
disposition, edits applied, deferred follow-up, what was not covered. It is
state the agent maintains within one conversation, rendered as a printed
receipt at closeout.

What remains here is making it durable — where state lives, its schema, its
lifecycle, and what happens when it goes stale. The bridge's pinned SHAs and
`content_drift` error give resume a stable identity to attach to.

### Review receipt

**Partially in v1.** The receipt is rendered at closeout, distinguishing
understood and reviewed; reviewed with a concern; changed during review;
deferred by the reviewer; not covered.

What remains here is export: writing it as a durable artifact, adding a
"blocked by missing evidence" category once evidence stops exist, and
publishing to a forge as a separate, explicitly authorized action.

### Mid-review changes beyond confirm-then-apply

v1 applies reviewer-requested changes to the working tree on explicit
confirmation, recording each in the ledger. Attribution lives in the ledger
rather than in git, which keeps it working on a detached HEAD and on branches
the reviewer does not own.

Open beyond v1: previewing a proposed change as an editor diff rather than
terminal text; landing review edits as a separable commit or patch; and the
question of who reviews changes an agent made during a review — a trust
inversion v1 answers only by requiring confirmation.

### Evidence model

Evidence connected to the claim it supports. "Tests passed" is much weaker than
showing which test demonstrates which invariant. Covers tests, type-check and
lint results, diagnostics, runtime behavior, callers and consumers, migration
and rollback consequences, and paths deliberately left unchanged.

VS Code's Testing API is the likely surface. `type: "evidence"` already exists
on the wire.

### Provenance

The presenting agent may not be the invocation that wrote the change. Without
durable authoring context it is reverse-engineering another agent's work and
can produce a plausible, false explanation.

The four-way labeling — stated / recorded / repository-derived / reconstructed
— ships in v1. What does not is *capturing* the review maped category: a small
artifact written during the coding session carrying the original request,
acceptance criteria, constraints and non-goals, design decisions, rejected
alternatives and why, assumptions, checks performed, and known gaps.

This requires instrumenting the authoring workflow, not the review workflow.

### Reviewer agency and accessibility

v1 honors navigation within a conversation. This spec owns persistence across
sessions, drift reporting on resume, adaptive depth, and the editor-native
surfaces — tree view for progress, comment threads for questions and decisions.

### Integration boundaries

What may be read from a forge (existing review findings, prior comments) and
what may be written back, under what authorization.

### Success metrics

Not tab-opening accuracy or tour completion rate. Comprehension: can the
reviewer summarize the change, name the central invariant, locate the next
modification? Review quality: are seeded defects found more often, are skipped
areas explicit? Efficiency: time to first substantive question, resumption cost.
Ownership after merge: fewer follow-up explanations, faster safe changes,
decisions still discoverable later.

The informative study compares ordinary diff review, the text-only tour, and
the driven stateful walkthrough on real agent-authored changes. Self-reported
confidence alone is misleading, since smooth narration can raise confidence
without raising understanding.

## Not yet decided

- Where tour state is persisted, and whether it is per-repository or per-user.
- Whether the receipt is a file in the repository, a local artifact, or forge-only.
- Whether evidence stops execute anything or only display existing results.
- How much adversarial review belongs in the tour versus a separate pass.
- Whether ownership checks are opt-in, adaptive, or closeout-only.

## References

- Bacchelli and Bird, [*Expectations, Outcomes, and Challenges of Modern Code Review*](https://www.microsoft.com/en-us/research/wp-content/uploads/2016/02/ICSE%202013-codereview.pdf)
- [Microsoft CodeTour](https://github.com/microsoft/codetour/blob/main/README.md) — introductory steps, visible step state, resume, ref pinning, drift handling
- [GitHub: reviewing proposed changes](https://docs.github.com/en/pull-requests/how-tos/review-pull-requests/reviewing-proposed-changes-in-a-pull-request) — viewed state, progress, pending comments, submitted review
- VS Code [Comment API](https://code.visualstudio.com/api/references/vscode-api), [Testing API](https://code.visualstudio.com/api/extension-guides/testing), [Tree View API](https://code.visualstudio.com/api/extension-guides/tree-view)
