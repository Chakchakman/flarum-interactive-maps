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
