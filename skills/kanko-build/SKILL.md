---
name: kanko-build
description: Implement a non-trivial code change from a request, issue, or specification while keeping change notes covering requirements, decisions, assumptions, risks, evidence, and final handoff context. Use for substantial implementation, fix, refactor, or migration work that should later receive an ownership walkthrough. Do not use for read-only review/explanation, trivial edits, or when the user opts out of change notes.
---

# Kankō Build

Implement the requested change normally while preserving the context a later
reviewer will need. These notes preserve the decisions and evidence that matter; they are
not a transcript, a replacement for tests, or permission to expand scope.

## Start the task

Read the request, specification, repository instructions, and relevant source
before proposing durable change record content. Resolve the absolute Git repository
root and inspect the current status so pre-existing user changes remain visible
and untouched.

Open a working-tree change record with `kanko_notes_open`:

- Use baseline `HEAD` and explicitly include staged, unstaged, and untracked
  content unless the user's requested scope says otherwise.
- Give it a short task-oriented title and identify the coding agent as the
  actor.
- Reuse a matching change record only when its title, thesis, and requirements belong
  to this task. If an exact or related change record belongs to another task, call
  `kanko_notes_open` again with `forceNew: true`; never merge unrelated task history
  for convenience.
- Keep the returned change record ID and latest aggregate revision. Every mutation
  must use the latest `expectedRevision`; on conflict, query current state and
  reconsider the semantic command rather than retrying blindly.

If change record tools are unavailable, continue the implementation and state at
handoff that durable capture was unavailable. Do not block ordinary coding on
the editor extension; change record tools do not require it.

## Seed durable context

Record the useful source material early through typed `kanko_notes_apply` commands:

- `SetThesis` for the problem, intended behavior, approach as currently
  understood, important non-goals, and highest uncertainty. Revise it later as
  understanding changes.
- `AddRequirement` for requirements, acceptance criteria, compatibility rules,
  constraints, and explicit non-goals. Keep separate requirements separate
  when they will map to different claims or evidence.
- `AddAssumption`, `AddInvariant`, and `AddRisk` only when they can affect the
  implementation, verification, rollout, or future maintenance.

Every durable statement needs structured provenance:

- Use `user-stated` for the request and later user direction.
- Use `source-document` with a file, issue, or design-document locator for
  sourced requirements.
- Use `session-recorded` for a decision or assumption explicitly recorded while
  implementing.
- Use `repository-observed` for facts directly visible in code, tests, config,
  or history.
- Use `execution-observed` for test, build, diagnostic, benchmark, or runtime
  results.
- Reserve `model-inferred` for reconstruction, include why it was inferred, and
  never narrate it later as author-stated rationale.

Do not persist private reasoning, credentials, environment dumps, unrestricted
terminal logs, or unrelated workspace activity. Prefer concise metadata and
bounded observations over raw output.

## Capture while implementing

Update the change record at meaningful decision points, not after every command or
edit:

- `AddDecision` when choosing among materially different approaches. Record
  the problem, chosen approach, relevant alternatives, reasons/tradeoffs,
  consequences, and conditions for revisiting it.
- `AddAssumption` or `AddRisk` when implementation reveals a dependency,
  uncertainty, failure mode, maintenance trap, or deferred concern.
- `AddEvidence` after a meaningful check. Record the command or procedure,
  observation, result, environment identity when relevant, limitations, and
  which claim it will support or contradict. Attach bounded raw output only
  when it materially improves reproducibility.
- Preserve useful failed approaches as a rejected alternative, contradictory
  evidence, or risk. Do not preserve routine syntax mistakes and exploration
  noise.

The initial working-tree identity will become stale as source changes. That is
expected. Continue recording preparation context, but do not create final code
references, claim support, tour coverage, or review state against stale code.
Do not refresh after every edit; change revisions are reviewable checkpoints,
not an edit log.

## Freeze the implementation candidate

When the implementation is stable:

1. Call `kanko_notes_refresh` with the final working-tree selection. Treat earlier
   evidence marked stale as historical, not current proof.
2. Run the verification appropriate to the change and record current evidence.
3. If verification itself changes tracked or generated content, refresh again,
   then rerun and record the checks whose applicability changed.
4. Add final `AddCodeReference` entries. Let the service bind paths, sides, line
   ranges, content digests, and the current change revision.
5. Add reviewable `AddClaim` entries for observable behavior, compatibility,
   security, reliability, performance, operability, or maintainability. Link
   requirements, code, decisions, risks, and current evidence using stable IDs.
6. Represent missing verification explicitly as evidence with `freshness:
   "missing"` or as an open risk; do not omit it and imply support.

Query created entities to obtain their service-assigned IDs before linking
them. Use explicit relationships when they clarify motivation,
implementation, support, contradiction, mitigation, dependency, or coverage.

## Prepare the ownership handoff

Create a semantic tour plan with `CreateTourPlan`. Each stop should be one
logical, commit-message-worthy unit and cover at least one change record entity unless
it is explicitly a context stop. Order foundations before consumers and put
real risk or weak evidence where the reviewer will encounter it.

Use `presentationVersion: 2` and the required
[stop, anchor, and beat contract](../../docs/kanko-v2-tour-model.md). Every stop
needs an id, risk, numbered source-backed anchors, and beats with `{{a:N}}`
narration references and prioritized `active` numbers. Resolve validation
findings; do not substitute unversioned or metadata-only stops.

Issue `MarkPrepared` only after the current change record has:

- a truthful final thesis;
- at least one reviewable claim;
- final code references for the important implementation;
- current or explicitly missing evidence;
- a coherent tour plan.

Then run `kanko_notes_check`. If the candidate is stale, refresh and repair the
affected references, evidence, claims, and stops before handoff.

Do not start or complete a review session, mark stops reviewed, accept risk on
the human's behalf, select an approval outcome, or emit a receipt. Those actions
belong to the later `kanko-tour` walkthrough.

In the implementation handoff, report the change record ID, final change identity,
important decisions and remaining risks, verification performed, missing or
stale evidence, and that the change is prepared for an ownership walkthrough.
