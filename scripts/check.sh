#!/usr/bin/env bash
# Runs locally what .github/workflows/ci.yml ran on a pull request: the Hugo
# build. GitHub Actions CI is off, so this is the check a change gets.
#
# Left out: the pr-title job. It checked the pull request title against
# Conventional Commits, which only exists on GitHub. Write the title as
# type(scope): subject when you open the pull request.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ $# -gt 0 ]; then echo "usage: scripts/check.sh" >&2; exit 2; fi

step() { printf '\n==> %s\n' "$*"; }
need() {
  command -v "$1" >/dev/null 2>&1 || { echo "check: $1 is not installed. $2" >&2; exit 1; }
}

need hugo "Install Hugo extended: https://gohugo.io/installation/"
[[ "$(hugo version)" == *extended* ]] || { echo "check: this Hugo is not the extended edition. Install Hugo extended: https://gohugo.io/installation/" >&2; exit 1; }

step "hugo --minify"
# Built into a temporary directory, so public/ is left as it was.
out=$(mktemp -d)
trap 'rm -rf "$out"' EXIT
hugo --minify --destination "$out"

printf '\ncheck: all steps passed\n'
