# GM permissions, visibility and independent embeds

Scope: remaining v0.2 release gates, 2026-10-25. Dedicated branch `feature/gm-privacy-regression`, based on the owner-tested code plus documentation updates. No product UX changes, production migrations or new permissions. Existing manage/embed/edit rules remain the contract.

## Automated coverage

- A real custom non-admin group starts with no map rights. Embed alone cannot access/attach the private catalog; manage alone cannot attach; both map grants still require permission to edit the specific post. A GM can use their own composer without broad post moderation. Explicit edit permission allows attaching to another author's post. Revocation is enforced by the API even with old browser bootstrap flags; normal read access to a still-visible post survives staff-permission revocation.
- Real HTTP/browser tests hide an admin-authored reply and its discussion. An assigned token owner loses scoped read/movement access (404, no map/token payload). Body-supplied scope cannot bypass the URL/post association. Restoration returns access; detach removes only the association and retains the map/token/coordinates.
- Two posts with different maps keep distinct token payloads and zoom states. A token from the other map cannot be moved using the first post. Removing one embed preserves the other. Viewport/document widths are checked at 390px and 1280px.
- A standalone installed-Flarum test exercises actual core post/discussion `hidden_at` and `is_private` scopes, plus independently registered post and discussion extension visibility scopers. The actor is a real custom-group map manager and token owner, with edit rights; positive read/move/attach controls pass before negative cases. Denials retain coordinates. All synthetic DB writes roll back and original table counts are verified.

The runtime test requires `--isolated-forum`, a loopback site URL and the named disposable CI/cloud database. Never run it or the Playwright suite against the owner's forum. No schema is changed. Rolled-back fixture inserts may advance auto-increment counters; this is not a DB snapshot restore. Browser fixtures are retained, without resets or deletion of existing users/maps. The GM browser case snapshots and restores the original global permission grants in the isolated forum.

Flarum's post flood protection stays enabled. The GM test waits out the normal ten-second creation window before asserting the revoked composer's exact 403 response; a 429 is not accepted as proof of authorization. Replies use core's actual JSON:API discussion relationship, not an unsupported discussionId attribute. These are test corrections, not product authorization fixes.

## Limits and owner acceptance

Core private flags and a synthetic extension visibility scoper verify the integration contract; they do not establish compatibility with any named third-party private-discussion extension. No such package has been selected or installed for this work. Narrow viewport checks do not replace manual touch gestures or theme inspection. The initial target runs are diagnostics; final counts/CI/SHA are recorded in PROJECT-CONTEXT.

On the owner's existing tested build (no code update needed for this coverage-only task): create a disposable GM group/account, grant Manage Maps and Embed Maps through the admin permission grid, and verify own-post attachment, denial on another author's uneditable post, then attachment after explicitly granting the relevant post-edit right. Revoke the map grants and check that staff operations fail after refresh. Restore intended group permissions afterward. Keep the original map/post link intact. Theme/touch checks and actual third-party privacy integrations remain distinct acceptance items. No automatic release/merge.


Local final baseline: 14/14 browser, 43/43 JS/build and PHP checks passed. The privacy case additionally uses distinct attempted coordinates for rejected moves, so unchanged saved coordinates demonstrate that denied requests did not write. Exact commit/CI results are recorded separately in PROJECT-CONTEXT. This coverage does not require installing a new product build on the owner's already-tested forum.
