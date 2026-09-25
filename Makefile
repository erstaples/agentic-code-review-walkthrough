SHELL := /bin/bash
.DEFAULT_GOAL := help

# Pass user arguments through the environment, never interpolate them into shell code.
export KANKO_BUMP_VERSION = $(VERSION)
export KANKO_RELEASE_TAG = $(TAG)
ifeq ($(shell uname -s),Darwin)
export TMPDIR := /private/tmp
endif

.PHONY: help setup check test test-archive build watch format format-check typecheck runtime runtime-check package rebuild integration version version-check version-sync bump release-check release

help:
	@printf '%s\n' \
	  'make setup                    Install locked development dependencies' \
	  'make check                    Check versions, runtime, types and formatting' \
	  'make test                     Run repository, MCP and extension tests' \
	  'make build | watch | format   Build, watch, or format sources' \
	  'make runtime                  Regenerate the checked-in MCP runtime' \
	  'make package                  Build and validate the VSIX' \
	  'make rebuild                  Set up, test and package from scratch' \
	  'make integration              Run VS Code host tests (EXTENSION_PATH supported)' \
	  'make version                  Print the authoritative version' \
	  'make version-check [TAG=vX.Y.Z]  Validate release metadata and optional tag' \
	  'make version-sync             Repair manifest/runtime copies without bumping' \
	  'make bump VERSION=patch       Bump patch, minor, major, or an exact X.Y.Z' \
	  'make release-check            Validate release readiness without creating a tag' \
	  'make release                  Tag and push from clean, current main; PUBLISHES publicly'

setup:
	@command -v jq >/dev/null || { echo 'error: Install jq first' >&2; exit 1; }
	@command -v python3 >/dev/null || { echo 'error: Python 3 is required' >&2; exit 1; }
	@node -e 'if (+process.versions.node.split(".")[0] < 22) throw Error("Node.js 22+ required")'
	npm --prefix editor-extension ci

check: version-check runtime-check typecheck format-check

test:
	npm --prefix editor-extension run test:all

test-archive:
	python3 scripts/test_check_vsix.py

build watch format typecheck:
	npm --prefix editor-extension run $@

format-check:
	npm --prefix editor-extension run format:check

runtime:
	npm --prefix editor-extension run runtime:build

runtime-check:
	npm --prefix editor-extension run runtime:check

package:
	npm --prefix editor-extension run package
	@version="$$(bash scripts/version.sh show)"; python3 scripts/check-vsix.py "editor-extension/kanko-$$version.vsix"

# Order these operations even under make -j: setup replaces node_modules.
rebuild:
	$(MAKE) setup
	$(MAKE) test test-archive
	$(MAKE) package

integration:
	npm --prefix editor-extension run test:integration

version:
	@bash scripts/version.sh show

version-check:
	@if [ -n "$${KANKO_RELEASE_TAG}" ]; then bash scripts/version.sh check "$${KANKO_RELEASE_TAG}"; else bash scripts/version.sh check; fi

version-sync:
	bash scripts/version.sh sync

bump:
	@bash scripts/version.sh bump "$${KANKO_BUMP_VERSION}"

release-check:
	bash scripts/release.sh --dry-run

release:
	bash scripts/release.sh
