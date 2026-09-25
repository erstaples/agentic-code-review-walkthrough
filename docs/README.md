# Kankō documentation

## Project tracking

Feature specifications, implementation plans, dependencies, and progress live in
[GitHub issues](https://github.com/getkanko/kanko/issues) and GitHub Projects.
See the [repository workflow](../AGENTS.md). Keep this directory focused on current
product/development guides and evidence; do not add task plans or completed journals.

## Current product and development guides

- [Installation and usage](../README.md)
- [Tour data contract](kanko-v2-tour-model.md)
- [Loading and navigation](kanko-v2-tour-loading.md)
- [Source presentation and tab ownership](kanko-v2-multi-anchor.md)
- [Layout policy and persistence](kanko-v2-layout.md)
- [Sidebar inventory and placement](kanko-v2-sidebar.md)
- [Extension development](../editor-extension/DEVELOPMENT.md)
- [TypeScript and retained JavaScript status](javascript-typescript-assessment.md)
- [Release and publication](extension-publication.md)
- [Branding](branding.md)

## Verification history

Reports under `verification/` record checks against specific historical builds.
Their phase names, future-work statements, screenshots, and pass counts describe
those builds. They are evidence, not current implementation instructions or proof
that the latest build passes. Unfinished acceptance work is tracked in GitHub
issues without rewriting historical results.

## Documentation cleanup

The September 25 workbench proposal removes superseded documentation:

| Removed material | Reason and maintained replacement |
| --- | --- |
| Original September 21 bridge design and implementation plan | Retired protocol, paths, and architecture; use the current contract, loading, and development guides. |
| Original bridge feedback and product-spec stub | Described pre-map storage and review behavior, including obsolete source-editing flows; current guides document shipped behavior and GitHub issues define new scope. |
| Legacy presentation guide | Described removed stop/focus routes and private presentation commands; use the tour model and source-presentation guides. |
| TypeScript/React migration plan | Migration approach is superseded by the shared TypeScript runtime and completed React conversion; current development/status guides cover the implementation and GitHub issues preserve unfinished checks. |

Earlier versions remain in Git history. Current contracts, operational guides,
the current JavaScript status assessment, and historical verification artifacts
are retained. Deleting a superseded plan does not mark its unverified work done.
