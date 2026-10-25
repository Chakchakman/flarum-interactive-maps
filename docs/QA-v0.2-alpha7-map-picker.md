# Alpha.7 — map picker in the post menu

Based on alpha.6 plus the development automation branch (PR #15). No backend changes or migrations. Attachment remains a server-authorized association with an existing saved post; marker text in authored posts remains inert.

## Behavior

The post menu opens a Flarum modal with map thumbnails, titles and IDs. Search filters the latest 100 maps returned by the existing staff-only catalog. A selected row requires explicit confirmation. Entering a positive ID or exported marker also permits attaching an older map outside that list, subject to the unchanged server checks. A failed request preserves the dialog and permits retry. Detach is unchanged.

## Automated validation

Node tests exercise search/ID validation and the modal's request lifecycle with mocked Flarum components: duplicate submission, success-only post updates, error/retry and late catalog response after closing. They do not validate the actual Flarum DOM, CSS or modal-manager integration. Existing access-helper tests and production build remain required.

## Local acceptance (pending)

1. First verify discussion #1 original message, BBCode toolbar, a disposable reply and a new discussion. Stop if normal forum functions or Mithril break.
2. On a disposable saved post, choose Attach map as administrator. Confirm the modal, thumbnails, keyboard focus, empty search, Cyrillic title search, exact ID and copied marker. Select map #9, confirm attachment, reload and verify it persists. Preserve the existing map on post #2.
3. Cancel/close without submitting: no association is created. Double-click submit: one POST. Simulate failed catalog loading and retry; simulate failed attachment and retry without losing the choice.
4. Check empty catalog/no matches and an explicit ID outside the latest 100. Missing/deleted maps and lost permissions must show server errors, not mark the post as attached.
5. As Yusha, confirm the staff controls remain absent and existing own-token movement still works. Check forged requests against existing access rules separately.
6. Detach only the disposable post's map. Map #9 and its tokens remain intact.
7. Test narrow screen, light/dark themes and multiple embedded maps. No composer/formatter integration is added.

Rollback: return to the previously tested alpha.6 checkout, rebuild JS and clear Flarum cache. No database restore or migration is needed. Keep this PR draft until live acceptance; commit release dist only after acceptance.

## Cloud browser regression suite (2026-10-24)

`tests/browser` now exercises five scenarios against a real Flarum 2 installation:

1. Forum boot/admin login/new discussion/reply/BBCode, inert marker, post-menu picker and cancellation. Resolve the saved reply by its API ID: Flarum's optimistic preview can temporarily share its text.
2. Cyrillic title search, image thumbnails, ID/marker input, explicit selection, cancel without POST, one successful association, reload and detach without deleting the map or changing BBCode.
3. Simulated catalog/attachment 503 failures, real retries, preserved selection and one successful POST on double-click.
4. Simulated empty/latest-100 catalog window, invalid input, a real missing-map 404 without a false attachment hint, and explicit existing ID outside the returned list.
5. Separate confirmed player session: catalog/attach/legacy-move/other-token/unlinked-post denial; real pointer drag of their own token at 200% zoom; saved coordinates after reload and unchanged other token.

Every scenario checks for JavaScript page exceptions. Successful map operations and authorization use the real API/database; only catalog-window/error responses and a disposable SVG image are intercepted. Fixtures are uniquely named and retained; tests do not reset the database or delete existing maps/users. Mail uses Flarum's log driver in CI.

The picker had a real ARIA/CSS regression: boolean `aria-pressed` became an empty attribute in Mithril. String values restore both selection styling and accessible pressed state; the browser asserts false/true and preservation after failed attachment. BBCode may render as either `<b>` or `<strong>`; assertions require a bold element with the exact original text.

Run `cd tests/browser && npm ci && npx playwright install --with-deps chromium && npm test` only against the isolated fixture forum configured in `.github/workflows/runtime-smoke.yml`, never against the owner's live database. CI uses Playwright's bundled Chromium; the initial cloud run used system Chromium 154 with a local config and MariaDB 11.4.13 instead of CI's 11.8. Results do not replace owner acceptance, mobile/theme checks, explicit GM permissions, or private-discussion integrations.

Local outcome: **5/5 browser scenarios passed, 39/39 JS tests passed, 27 PHP permission assertions passed; Composer strict validation, PHP syntax and production builds passed.** Owner acceptance and the CI result for the new commit remain separate gates.

CI confirmation for code commit `f2c5fdaf541e68993db9b7988cf29a60d6e3293b`: [Extension CI 40040296018](https://github.com/Chakchakman/flarum-interactive-maps/actions/runs/40040296018) and [Flarum runtime smoke 40040296019](https://github.com/Chakchakman/flarum-interactive-maps/actions/runs/40040296019) both **Success**. Windows checks passed in GitHub CI. The subsequent base synchronization changes documentation/agent instructions only; owner acceptance and release approval remain pending.


## Current acceptance update — 2026-10-25

The sections above describe the original picker-only scope and historical five-scenario suite. The cumulative code baseline is now `28bff5e`, with 43 JS tests, 11 real-Flarum browser scenarios and successful PHP/CI checks. Composer selection, owner search and presentation additions have separate QA documents in this directory; the grid-style addition includes an approved additive migration, actually run on the owner's lab after a fresh backup.

Owner confirmed picker attachment/thumbnails/search/highlight/cancel, composer attachment and draft cancellation, owner suggestions for creation/reassignment, circular tokens, avatars, grid color/thickness, and the supplied two-account player checklist: own movement allowed, other movement denied, position survives reload, map/grid/owner controls unavailable to the player. This updates the earlier pending owner statuses for those named actions only. Explicit GM grants, private-discussion integrations, multiple embeds, narrow layouts/themes and final release review remain separate gates. No release/merge authorization; no need to repeat passed manual cases without a regression reason.
