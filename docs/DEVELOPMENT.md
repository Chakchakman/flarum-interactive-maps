# Development workflow

## Current baseline

Development is based on PR #14 (`feature/v0.2-map-export-attach-ui`, v0.2 alpha.6a), not on the older main branch. Keep the PR draft until the Flarum acceptance checks in `docs/QA-v0.2-alpha6-export.md` pass. Post-menu attachment is the primary UX; a marker in post text remains inert.

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

The PHP tests currently exercise access helpers; they do not boot Flarum or replace HTTP/API integration tests. Green CI does not establish that BBCode, new discussions, attach/detach or player permissions work through the real UI. These checks remain in the alpha.6 QA checklist.

The downloadable archive is a test build, not a release. It does not update tracked `js/dist`, create tags, publish to Packagist or install anything on a forum. Before a Composer release, rebuild and commit the dist files into the release commit so the tagged source archive contains them.

Next stages: disposable Flarum integration environment, API authorization tests with real users/posts, then browser tests for the main staff/player flows.

## One-command check in the existing Windows lab

The supplied Compose file mounts `./extension` at `/workspace` for Node (working directory `/workspace/js`) and at `/var/www/flarum/packages/map-correct` for PHP. The script uses those exact paths and explicitly selects the lab's docker-compose.yml.

After switching the extension checkout to this branch, from the lab directory run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\extension\scripts\Test-Lab.ps1
```

Docker Desktop and the existing app/db services must already be running. The execution-policy option applies to this process only. The script checks Compose, prints Git status and HEAD, validates Composer, runs PHP access-helper tests, installs locked JS dependencies, runs all JS tests and builds, then clears Flarum's cache. Every failed external command stops the sequence; the caller's directory is restored.

This checks/builds the current working tree, including local changes. It does not fetch, switch branches, stash changes, migrate the database or automatically roll back. On failure, cache clearing is skipped; npm/build may already have modified dependencies or generated assets. The original Compose file and its credentials are not copied into the public repository.

Tests in tests/labScriptTest.ps1 mock Git/Docker on Windows PowerShell 5.1 to verify ordering and failure handling. They do not establish that the user's live Docker installation works; the first local run remains necessary.
