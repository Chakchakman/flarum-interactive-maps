# Development workflow

## Current baseline

Owner-tested cumulative code: `851f38b` on `feature/post-map-sync` (v0.3 Alpha.1). Alpha.2 source `6499c8d` on `feature/token-move-conflicts` passed automated PHP/JS/browser/Windows checks and both CI workflows; its owner acceptance is pending. Current optimization work is on `feature/sync-performance`. Exact confirmations and results are recorded in [PROJECT-CONTEXT](PROJECT-CONTEXT.md). `main` remains the reviewed-release branch; do not treat older beta/alpha branch labels or manifest versions as the current verified build. Preserve the Alpha.6 recovery branch `backup/alpha6-working-20261024` / `5c846e2`.

Post-menu attachment and optional composer selection are supported; marker text remains inert. Focused stacked branches keep independent changes reviewable. If GitHub API refuses PR creation, publish the branch and compare link and record the restriction; do not claim a PR exists or create a duplicate of an existing PR.

## For each change

1. Create a feature/fix branch from the agreed development baseline.
2. Implement a focused change and add regression coverage for changed behavior.
3. In `js`, run `npm ci` then `npm run check`. This discovers all `tests/*.test.mjs` files and builds production assets. Existing focused test commands remain available.
4. Open a draft PR against the baseline branch. CI validates Composer metadata, PHP syntax and permission tests, then runs all JS tests and the production build.
5. From the successful Actions run, download `interactive-maps-test-build-<sha>`. Extract its ZIP wrapper, then extract the contained tar.gz into a separate test copy of the extension. The archive includes freshly built JS and `BUILD-COMMIT.txt` identifying the exact tested commit (a PR run may test a synthetic merge commit).
6. Test the extension in the local Docker Flarum lab. Record the tested SHA, roles and results in the PR. Only then consider merging/releasing.

GitHub Actions also supports manual runs through Run workflow once this workflow exists on the default branch. No credentials are needed by the workflow beyond read-only repository access.

## Windows / Docker lab

Use the existing `flarum-map-lab` Compose environment. From the lab directory, the existing Node service can run `docker compose run --rm node npm ci` followed by `docker compose run --rm node npm run check`, provided its working directory is the extension's `js` directory. Local service mounts remain specific to your Compose configuration.

## Scope of automation

Standalone PHP checks cover access helpers, transactions, grid validation and synthetic migration preservation. The separate runtime workflow installs real Flarum and runs browser/API regression scenarios. Green CI does not replace owner acceptance of role/theme/mobile and integration cases. See the current Alpha.7 and focused QA documents.

The downloadable archive is a test build, not a release. It does not update tracked `js/dist`, create tags, publish to Packagist or install anything on a forum. Before a Composer release, rebuild and commit the dist files into the release commit so the tagged source archive contains them.

The disposable Flarum integration environment and browser suite are implemented. Synchronization and conditional writes have automated coverage. Next: owner conflict/upgrade acceptance, performance regression verification and the remaining release gates in [RELEASE-CHECKLIST](RELEASE-CHECKLIST.md).

## One-command check in the existing Windows lab

The supplied Compose file mounts `./extension` at `/workspace` for Node (working directory `/workspace/js`) and at `/var/www/flarum/packages/map-correct` for PHP. The script uses those exact paths and explicitly selects the lab's docker-compose.yml.

After switching the extension checkout to this branch, from the lab directory run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\extension\scripts\Test-Lab.ps1
```

Docker Desktop and the existing app/db services must already be running. The execution-policy option applies to this process only. The script checks Compose, prints Git status and HEAD, validates Composer, runs PHP access-helper tests, installs locked JS dependencies, runs all JS tests and builds, then clears Flarum's cache. Every failed external command stops the sequence; the caller's directory is restored.

This checks/builds the current working tree, including local changes. It does not fetch, switch branches, stash changes, migrate the database or automatically roll back. On failure, cache clearing is skipped; npm/build may already have modified dependencies or generated assets. The original Compose file and its credentials are not copied into the public repository.

Tests in tests/labScriptTest.ps1 mock Git/Docker on Windows PowerShell 5.1 to verify ordering and failure handling. They do not establish that the user's live Docker installation works; the first local run remains necessary.
