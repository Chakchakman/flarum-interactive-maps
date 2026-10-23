# v0.2.0 alpha.6a — export and secure post attach without console

**Experimental UI-only workflow.** Extends alpha.5 bounded viewport. Existing database table and hardened API are reused, no migrations.

## User interaction

1. A user with map.manage opens /maps/9 and clicks **Экспорт · Копировать код**, copying `[interactive-map id=9]`. This is a map reference, **not a real iframe**, and does not grant anyone permission to view the map.
2. The staff member creates or opens an **already saved** comment post they are authorized to edit, opens its three-dot post menu and selects **Прикрепить карту**. Paste the exported marker into the prompt. A plain numeric map ID is also accepted.
3. Flarum sends `POST /api/chak-map-embeds` with postId and mapId; the backend requires both map.manage and map.embed and edit permission on that visible comment. On success the existing lazy map component appears under the post text. Nothing is written into the post body.
4. The same menu offers **Открепить карту** for already linked posts, using existing protected DELETE API and explicit confirmation. This removes only the association, **not the map or tokens**.
5. Ordinary players do not see these controls. Server re-checks permissions independently of client visibility.

**Approved UX (2026-10-23):** the user prefers the independent post-menu **«Прикрепить карту»** action over putting a marker in the message body. Copying the marker and pasting it directly into the *message body* does NOT create an attachment: use the post action to attach. Automatic parsing of marker text in the composer is **not planned as the immediate next step**; only revisit if expressly requested. This also avoids reintroducing earlier Flarum editor/Mithril regressions.

## Local two-account QA (no migrations)

1. Save local JS build, switch to `feature/v0.2-map-export-attach-ui`, rebuild production JS and clear cache. Keep backup and older working alpha.5 branch for rollback.
2. First check forum root, original post #1, post #2, BBCode toolbar, creation of a disposable reply AND a new discussion, before testing the new controls. STOP/rollback if normal forum actions break.
3. Admin /maps/9: Export button visible; click, check clipboard holds the **exact** `[interactive-map id=9]`. If browser clipboard permission is unavailable, a prompt should reveal the code for manual copying.
4. On a **new disposable saved comment** not currently linked to a map, open the three-dot post menu as admin; select **Прикрепить карту**; paste copied marker. Expect the inline board without refreshing; after Ctrl+F5 the association remains. Leave post #2 untouched for comparison.
5. Repeat with a granted map manager + embed permission who can edit the comment, if one is configured; someone who cannot edit should not see the action. Test that an ordinary member Yusha sees the map in an allowed post, but NEVER sees Export or Attach/Detach controls, and cannot POST the attachment API (403).
6. After successful attachment on a disposable post, click **Открепить карту**, confirm, and reload: board should disappear, map #9 must remain in the staff catalog with unchanged tokens. If DELETE fails, show error and keep board state.
7. Test malformed prompt contents: arbitrary HTML/iframe, mixed text, another map number with leading zero, nonexistent map ID — they should be rejected, or server should return a user-facing error without affecting the post.
8. Existing post #2 already has map #9: admin should see **Открепить карту** and the board; do NOT detach this original test association unless you intend to reattach it.
9. Check post stream does not throw Mithril errors in F12, no BBCode controls vanish, no unexpected 422 when posting. The export marker is inert text until used in the attach dialog.
10. Once user verifies, commit compiled js/dist/forum.js and js/dist/forum.js.map; require green CI for final commit. Keep the PR draft until live acceptance.

## Rollback

Switch to `feature/v0.2-bounded-map-viewport`, rebuild and clear Flarum cache. No migrations, no table drops. The existing links survive code rollback.
