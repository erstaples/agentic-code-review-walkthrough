#!/usr/bin/env bash
# Compatibility entry point; development commands live in the root Makefile.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
exec make -C "$root" rebuild "$@"
