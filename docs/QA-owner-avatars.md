# Avatars in owner suggestions

Owner explicitly confirmed user avatars (not role/group badges) on 2026-10-25. The shared owner selector shows Flarum's native Avatar component next to @username, both in token creation and reassignment. Native initials/color are used for absent avatars; a failed image falls back locally to initials. Suggestions keep their existing keyboard behavior and accessible option names; decorative avatars are hidden from assistive naming.

The staff-only bounded prefix endpoint adds only public avatarUrl to username/id, using the core avatar accessor/driver and existing visibility/management checks. Email and private profile attributes are not serialized. The frontend creates isolated User view-models for the limited DTO; it never pushes partial lookup fields into shared user records, so previously loaded nicknames/profile avatars are preserved. No migration.

Local checks: 40 JS tests/build and 10 real Flarum browser scenarios passed. API privacy expectations require exactly username/avatarUrl. New browser coverage checks real-API no-avatar initials, controlled image URL loading, broken-image fallback, unchanged shared nickname/avatar, and both owner selectors. Image URL cases use controlled DTO/image fixtures; native avatar upload processing is not changed or tested by this feature. Full forum/composer/picker/two-account movement/search suites remain green.

Owner confirmed the supplied avatar manual check succeeded on 2026-10-25, using code 28bff5e (both owner selectors and the no-avatar fallback checklist). This does not independently confirm every keyboard interaction, profile/header, theme or narrow-screen combination. Native avatar upload remains outside this change. No release/merge approval.
