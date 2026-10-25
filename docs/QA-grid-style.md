# Per-map grid color and thickness — review before existing-DB migration

Requested 2026-10-25. Staff editor adds a hex color picker and a 0.5–5 px thickness slider in half-pixel steps. Values are persisted per reusable map and returned by the existing staff/post-scoped APIs. Both contexts use the shared board; geometry, snapping, tokens, coordinates and server authorization are unchanged. The existing white/48%-opacity/1px appearance remains the default; opacity is not a new setting.

## Concrete schema change requiring owner approval

Migration: migrations/2026_10_25_000004_add_grid_style.php, two additive columns on chak_maps:

- grid_color VARCHAR(7) NOT NULL DEFAULT '#ffffff'
- grid_line_width DECIMAL(3,1) NOT NULL DEFAULT 1

No existing map/token/post/link is deleted or rewritten. API accepts only #RRGGBB, canonicalizes case, and accepts finite numeric widths in the slider's range/step; strings, bools, null, unsafe color strings and unsupported widths are rejected without saving. Old clients continue to work; new board rendering safely defaults when style metadata is absent/malformed.

AGENTS.md requires a database backup and human approval for existing-schema changes. This migration is prepared for review, NOT applied to the owner's DB or the prior cloud forum DB. The latter still has no new columns. Tests use (a) an in-memory synthetic old schema to verify upgrade/defaults/map/token/link preservation and disposable rollback, and (b) a new empty MariaDB forum for fresh installation and real HTTP/browser checks. These are not a production upgrade. Keep a fresh DB dump before any authorized existing-DB migration. Prefer code rollback while retaining additive columns/style data; do not automatically run down or drop tables/columns.

## Validation

Local final: 43 JS tests/build, 11 browser scenarios, Composer strict validation/PHP syntax, existing 27 access assertions, grid validator checks, four composer transaction cases and two migration preservation/rollback cases passed.

The new browser test covers default appearance; saving color/thickness; actual SVG stroke width/opacity (not merely the model value); reload in editor and embedded post; unchanged geometry/token coordinates; real invalid API requests; simulated 503 with optimistic-style rollback and successful retry. Player style PATCH is denied. Tests recognize Flarum's POST + X-HTTP-Method-Override transport for PATCH. SVG uses real hyphenated stroke-width/stroke-opacity: Mithril does not translate React-style camelCase names.

Manual acceptance pending approval and backup: existing maps retain their previous appearance/data after migration; choose contrasting colors and thicknesses, reload editor/post and check zoom/pan/owned-token drag; two accounts, narrow layout and themes. Do not change the owner's original map/post association. This branch includes the independently tested circular tokens and owner avatars; those earlier branches require no migration. No automatic release/merge.

Owner approval received 2026-10-25: apply after a fresh DB backup. Use the reviewed CLI helper from the installed Flarum root: `php packages/map-correct/scripts/Migrate-GridStyle.php --approved-after-backup` (the package mount is specific to the owner's existing lab). It permits only the expected migration in Interactive Maps, refuses other pending/partial schema states, checks row counts, and performs no core/other-extension migration. Its already-applied path was verified on the new cloud fixture and is included in runtime CI. Back up before calling; do not interactively edit maps/tokens during the count verification. Approval is not proof that the owner's migration has run.
