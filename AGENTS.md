# Codex agent instructions — Flarum Interactive Maps

This repository contains a **public Flarum 2.x extension** for interactive tabletop/RPG maps. The product owner communicates in Russian. Avoid changing agreed product behavior without explicit approval.

## Read these first
1. `docs/PROJECT-CONTEXT.md`: current working baseline, recorded decisions, manual acceptance and project progress.
2. `docs/PRODUCT-VISION.md`: user journeys, attachment UX and authorization.
3. `ROADMAP.md`: milestone priorities and release gates.
4. Relevant `docs/QA-*.md` for the specific alpha being changed.

Older parts of the README and ROADMAP may lag behind the latest project context. Check the exact PR and commit before making claims about releases.

## Product invariants
- Staff with server-validated permissions manages the map catalog and attaches maps to **saved, editable posts via the post menu**, or selects a map while composing a new discussion/reply (owner-approved 2026-10-24). Draft selection is separate from authored text; the server must atomically create the post and its authorized association.
- An exported marker such as `[interactive-map id=9]` is an inert identifier for the attach dialog, NOT active BBCode, HTML, or an iframe.
- Detaching removes only the post association; never the underlying map or tokens.
- Players can move only their assigned tokens within authorized visible post embeds; validate ownership, authentication and discussion visibility **on the PHP server**.
- Never break ordinary Flarum UI: creating discussions/replies, BBCode/Markdown editors, post controls, routes, responsive layout.
- Maps use a bounded viewport, slider zoom and unified image/grid/token transforms. Do not regress token coordinates or player permissions.

## Branch, release and QA workflow
- The verified **local alpha.6 recovery snapshot** is `backup/alpha6-working-20261024` at `5c846e2be87303e084fb2a949d074827367c5ea6`. It contains locally working compiled `js/dist/forum.js` and `js/dist/forum.js.map`. Preserve it; NEVER force-push, rewrite or modify this branch.
- `main` is reserved for reviewed releases. Never push directly to `main`, merge PRs, publish packages/tags, deploy to a user's forum or delete remote branches without explicit human approval.
- Current experimental work is in draft PRs (including alpha.7 picker PR #16 and runtime smoke PR #17). A green webpack/JS build is NOT proof of working Flarum DOM.
- Work on a dedicated topic branch/PR; keep changes focused and make all assumptions/risks explicit. Avoid piling unrelated changes into the same PR.
- Run the relevant local checks wherever dependencies are available: `composer validate --strict --no-check-publish`, PHP syntax checks and repository PHP tests, `cd js && npm ci && npm run check`. Check GitHub Actions results, including Flarum browser smoke tests.
- For UI/auth changes, require browser testing in a real Flarum 2 environment and two-account role checks before lab acceptance. Record exactly what was verified versus merely written or mocked.
- Before preparing each **new** PR, and after meaningful design ideas, decisions, bug findings or verification, update `docs/PROJECT-CONTEXT.md`. Keep `docs/PRODUCT-VISION.md` and `ROADMAP.md` consistent when the agreement or scope changes.
- If the runtime smoke fails, inspect logs/traces, differentiate test-selector failures from actual Flarum regressions and fix them safely before promoting alpha versions.
- Never automatically advance a draft PR to released/accepted based solely on CI.

## Safety and spending
- Never access or alter the owner's local Docker environment or database. Git does not back up MariaDB.
- Do not run database resets, destructive migrations, `docker compose down -v`, hard resets, force pushes, history rewrites or deletion of production data. Schema changes require a database backup and human approval.
- Never commit secrets, private configuration, real user data or credentials; use throwaway local test accounts only. Do not add GitHub Actions secrets or privileged write tokens without approval.
- Do not add paid cloud services, OpenAI API billing, paid Codex credits, paid CI runners or unnecessary new production dependencies. Stop and ask for approval if needed.
- Minimize GitHub Actions permissions (`contents: read` for tests); do not introduce unreviewed execution of PR code with write-privileged tokens or `pull_request_target`.
- Autonomous task output is a branch/PR, tested artifact or diagnostic report **for review**, never a silent publication or merge.

## Response format
For each development task: state the change, exact branch/commit/PR, which checks passed/failed/not run, risks, and whether human action or acceptance is required. Do not claim ongoing work between tasks unless an actual Codex automation is configured.
