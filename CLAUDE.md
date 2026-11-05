# CLAUDE.md

The README covers how to run and deploy the site.

## Local validation

GitHub Actions CI is off to save paid minutes, so nothing checks a pull request on GitHub. Run `scripts/check.sh` and make it pass before you push. It runs `hugo --minify`, the build CI ran (Hugo extended), into a temporary directory. The pull request title still has to follow Conventional Commits for release-please, and nothing checks it now.

The pre-push hook in `.githooks/pre-push` runs `scripts/check.sh`. Claude Code sessions enable it on start; humans enable it with `git config core.hooksPath .githooks`.
