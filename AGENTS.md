# Repository workflow

## Planning and project tracking

- Track project proposals, feature specifications, implementation plans,
  dependencies, task checklists, and progress in GitHub issues and Projects.
- Use one parent issue for a substantial feature's specification and acceptance
  criteria, with linked implementation issues for independently shippable slices.
  Keep status in GitHub; do not duplicate the plan or its checklist in the repo.
- Do not commit task plans, completed implementation journals, or generated
  planning directories such as `docs/superpowers/plans/`. Temporary working notes
  belong outside the repository. Do not create replacement planning directories.
- Keep repository documentation focused on maintained product behavior,
  architecture, contracts, setup, and operational guidance. Historical verification
  reports may remain as evidence with clear build identity and limitations.
- Before deleting a superseded plan, move genuinely unfinished work into issues.
  Do not reopen completed work or claim unfinished acceptance is complete.

## Coding and pull requests

- Start requested work from `dev` unless the task specifies another base; use an
  isolated worktree when needed to preserve unrelated changes.
- Commit and push work in progress when a slice is complete or a coding turn ends.
- Always open a PR for the working branch. Keep incomplete PRs draft and mark
  completed, reviewable work ready for review.
- Link the relevant issue in each PR. Use `Closes #<number>` only when the PR
  fulfills that issue's acceptance criteria; otherwise describe its contribution.
- Keep implementation evidence and status on the issue/PR. Passing automated
  tests does not establish actual UI acceptance.
