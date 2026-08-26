# GlyphWitch API Reference (historical / out of scope)

> **Status:** Historical inventory of GlyphWitch manuscript-platform routes.
> GlyphWitch integration is **out of scope for now** for Vellum Rift delivery.
>
> **Do not** treat this file as the live Vellum Rift API. Live routes:
> [backend/src/index.ts](../../backend/src/index.ts). Auth:
> [authentication.md](authentication.md). Integration stance:
> [backend-integration-summary.md](backend-integration-summary.md).
>
> **Migrations in this monorepo:** `backend/src/migrations/` (currently
> `001_initial_schema.sql`), applied via `pnpm migrate`. The
> `backend/migrations/*.sql` paths below were GlyphWitch-era references and are
> **not present** in this repository.

Last updated: 2026-05-29 (inventory); scope banner: 2026-08-26.

Historical schema sources formerly cited (missing from this repo unless noted):

- [init.sql](../../init.sql) (repo root, if present)
- `backend/migrations/001_initial_schema.sql` … `007_bluekey_auth_compat.sql` (GlyphWitch paths; **broken links — not in tree**)
- Current Vellum Rift SQL: [backend/src/migrations/001_initial_schema.sql](../../backend/src/migrations/001_initial_schema.sql)

## Conventions

- Base path: `/api`
- Authentication: Bearer token for protected routes.
- Content type: JSON unless upload endpoint specifies multipart.
- Notes in this file use "Primary tables" to indicate the main persisted entities touched by each endpoint group.

## Health And Public Endpoints

Primary tables: `security_questions` (read), `eula_acceptances` (indirect status checks in authenticated route).

- `GET /api/health`
- `GET /api/security-questions`
- `GET /api/eula/config`
- `GET /api/eula/pdf`

## Authentication And Account

Primary tables: `users`, `user_profiles`, `user_security_answers`, `security_questions`, `passkeys`, `totp_setup_secrets`, `refresh_tokens`, `authentication_tokens`, `settings`, `audit_log`.

- `POST /api/register`
- `POST /api/suggest-username`
- `POST /api/login`
- `POST /api/auth/bluekey/exchange`
- `POST /api/refresh-token`
- `POST /api/refresh-tokens/revoke`
- `POST /api/forgot-password`
- `POST /api/reset-password/verify`
- `POST /api/reset-password`
- `POST /api/passkey/register-options`
- `POST /api/passkey/register-verify`
- `POST /api/passkey/auth-options`
- `POST /api/passkey/auth-verify`
- `POST /api/totp/setup`
- `POST /api/totp/verify-setup`
- `POST /api/totp/auth`
- `POST /api/user/auth-method`
- `GET /api/user/profile`
- `PATCH /api/user/profile`
- `POST /api/user/change-password`
- `PATCH /api/user/email`
- `GET /api/users`
- `DELETE /api/user/account`
- `POST /api/user/deactivate`
- `POST /api/user/reactivate`
- `GET /api/user/export`

## Documents And Uploads

Primary tables: `documents`, `pages`, `document_permissions`, `document_teams`.

- `POST /api/documents/create`
- `GET /api/documents/resolution`
- `POST /api/documents/upload`
- `POST /api/documents/upload-images`
- `GET /api/documents/upload/progress/:documentId`
- `GET /api/documents`
- `GET /api/documents/:id/download`
- `GET /api/documents/:id/pages`
- `PUT /api/documents/:documentId/pages/save`
- `PUT /api/documents/:documentId/pages/:pageId`
- `POST /api/documents/:documentId/pages/upload`
- `POST /api/documents/:documentId/pages/upload-multiple`
- `PATCH /api/documents/:id`
- `DELETE /api/documents/:id`

## Annotations, Layers, Glyphs, Corrections

Primary tables: `annotation_layers`, `drawing_annotations`, `glyph_groups`, `glyph_group_members`, `stroke_classification_corrections`, `pages`, `documents`.

- `POST /api/annotations/batch`
- `GET /api/documents/:id/annotations`
- `GET /api/documents/:documentId/pages/:pageId/annotations`
- `POST /api/pages/:pageId/annotations`
- `POST /api/annotations`
- `GET /api/documents/:id/layers`
- `POST /api/layers`
- `POST /api/documents/:documentId/glyphs/merge`
- `DELETE /api/documents/:documentId/glyphs/:glyphId/unmerge`
- `POST /api/corrections/batch`
- `GET /api/documents/:documentId/corrections/analytics`
- `POST /api/glyph-groups`
- `GET /api/documents/:documentId/pages/:pageId/glyph-groups`
- `PUT /api/glyph-groups/:id`
- `DELETE /api/glyph-groups/:id`
- `POST /api/glyph-groups/:id/members`
- `DELETE /api/glyph-groups/:id/members/:strokeId`
- `POST /api/glyph/predict`

## Theories And Dictionary

Primary tables: `theories`, `theory_transcriptions`, `dictionary`, `users`, `documents`.

- `POST /api/theories`
- `PATCH /api/theories/:id`
- `DELETE /api/theories/:id`
- `GET /api/theories`
- `GET /api/theories/users`
- `GET /api/theories/:theoryId`
- `GET /api/documents/:documentId/theories`
- `PUT /api/theories/:theoryId/transcriptions`
- `GET /api/theories/:theoryId/transcriptions`
- `GET /api/dictionary`
- `POST /api/dictionary`
- `PUT /api/dictionary/:id`
- `DELETE /api/dictionary/:id`

## Chat, Moderation, EULA, Activity

Primary tables: `chats`, `history`, `user_reports`, `profanity_flags`, `user_bans`, `user_document_activity`, `eula_acceptances`.

- `POST /api/documents/:documentId/history`
- `POST /api/documents/:documentId/chats/bot`
- `GET /api/documents/:documentId/chats`
- `POST /api/documents/:documentId/chats`
- `POST /api/documents/:documentId/report-user`
- `GET /api/documents/:documentId/flagged-chats`
- `POST /api/documents/:documentId/flagged-chats/:flagId/action`
- `GET /api/documents/:documentId/user-ban-status/:userId`
- `GET /api/documents/:documentId/bans`
- `DELETE /api/documents/:documentId/bans/:banId`
- `GET /api/documents/:documentId/activity`
- `PUT /api/documents/:documentId/activity`
- `GET /api/eula/status`
- `POST /api/eula/accept`

## Teams, Permissions, Notifications

Primary tables: `teams`, `user_teams`, `team_invitations`, `notifications`, `documents`, `document_permissions`, `document_teams`, `users`.

- `POST /api/teams`
- `GET /api/teams`
- `GET /api/teams/:id`
- `PATCH /api/teams/:id`
- `DELETE /api/teams/:id`
- `POST /api/teams/:id/invites`
- `GET /api/teams/:id/invites`
- `DELETE /api/teams/:id/invites/:inviteId`
- `GET /api/users/:username/pending-invites`
- `POST /api/teams/:id/members/:memberId/accept`
- `POST /api/teams/:id/members/:memberId/leave`
- `POST /api/teams/:id/members/join`
- `PATCH /api/teams/:id/members/:memberId/role`
- `GET /api/user/teams`
- `PATCH /api/documents/:id/ownership`
- `POST /api/documents/:id/permissions/grant`
- `GET /api/documents/:id/permissions`
- `PATCH /api/documents/:id/permissions/:permissionId`
- `DELETE /api/documents/:id/permissions/:permissionId`
- `POST /api/documents/:id/teams/grant`
- `GET /api/documents/:id/teams`
- `PATCH /api/documents/:id/teams/:teamId`
- `DELETE /api/documents/:id/teams/:teamId`
- `GET /api/notifications`
- `PATCH /api/notifications/:id`

## Audit And Sync

Primary tables: `audit_log`, `sync_idempotency`, `dictionary`, `glyph_groups`, `glyph_group_members`, `theories`, `theory_transcriptions`.

- `POST /api/audit`
- `POST /api/sync/operations`

## Database Storage Inventory (Comprehensive)

This section summarizes what the database stores, including entities that may not currently have public API routes.

### Authentication And Identity

- `users`: account identity, auth mode (password/passkey/totp/bluekey), admin/deactivation/deletion lifecycle state.
- `user_profiles`: profile metadata (name, avatar, bio).
- `security_questions`: available security challenge questions.
- `user_security_answers`: hashed security answers per user/question.
- `passkeys`: WebAuthn credentials and signature counters.
- `totp_setup_secrets`: temporary TOTP enrollment secrets.
- `authentication_tokens`: short-lived auth/session tokens.
- `refresh_tokens`: refresh token store.
- `settings`: key/value configuration and secrets.

### Collaboration, Documents, Drawing, Interpretation

- `documents`: document metadata and ownership.
- `pages`: document page images and page metadata.
- `document_permissions`: direct user-level access grants.
- `document_teams`: team-level document access grants.
- `annotation_layers`: named drawing layers per document.
- `drawing_annotations`: strokes/glyph traces, including compound glyph metadata.
- `glyph_groups`: logical glyph clusters within a page.
- `glyph_group_members`: stroke membership within groups.
- `stroke_classification_corrections`: user corrections for classifier analytics.
- `theories`: user-created interpretation/theory records.
- `theory_transcriptions`: transcription text by theory and glyph.
- `dictionary`: user-owned lexical entries.
- `history`: change history snapshots.
- `traces`: raw stroke trace records.
- `annotations`: transliteration/interpretation records.
- `references`: citation links for annotations.
- `lines`, `words`, `glyphs`, `diacritics`: hierarchical segmentation entities.

### Teams, Invites, Activity, Messaging, Moderation

- `teams`: team containers and ownership.
- `user_teams`: team membership and role.
- `team_invitations`: invite records and status.
- `notifications`: user notifications and read status.
- `chats`: document chat messages.
- `user_document_activity`: per-user active context in a document.
- `user_reports`: abuse reports.
- `profanity_flags`: profanity moderation queue.
- `user_bans`: per-document bans.
- `eula_acceptances`: acceptance evidence (version/time/client metadata).

### Operational And System Tables

- `schema_migrations`: applied migration tracking.
- `sync_idempotency`: replay/idempotency protection for client sync batches.
- `audit_log`: API audit trail emitted by the application.
- `audit_logs`: migration-added audit table and trigger function support.
- `login_attempts`: migration-added login attempt tracking.
- `logs`: generalized app log records.

### Stored But Not Exposed Via Public API Routes (Current)

- `guest_links`, `guest_responses`: guest signature workflow data exists at schema level, but no `/api` routes are currently defined in [backend/src/index.ts](../../backend/src/index.ts).
- `audit_logs`, `login_attempts`: present via migration support, while the app routes primarily write to `audit_log`.

## Validation And Rate Limits

Authentication, registration, password reset, upload, and refresh token endpoints apply rate limiting and request validation. See [auth-and-permissions.md](auth-and-permissions.md).

## Endpoint Contracts (Expectations And Responses)

Use this section as a practical contract guide. Exact JSON field sets can evolve; for implementation-level truth, always confirm against [backend/src/index.ts](../../backend/src/index.ts).

### Health And Public

- `GET /api/health`: expects no body; returns `200` with service health payload (`status: ok`).
- `GET /api/security-questions`: expects no body; returns `200` array of security question objects.
- `GET /api/eula/config`: expects no body; returns `200` EULA configuration/version metadata.
- `GET /api/eula/pdf`: expects no body; returns `200` PDF stream or file response.

### Authentication And Account

- `POST /api/register`: expects JSON with `username`, `email`, `authMethod`, `securityQuestions[3]`; password required for password auth; returns `201` with account creation success and auth bootstrap data.
- `POST /api/suggest-username`: expects identity/name hint fields; returns `200` with a suggested unique username.
- `POST /api/login`: expects `email`, `password`; returns `200` with `token`, `refreshToken`, and user summary.
- `POST /api/auth/bluekey/exchange`: expects Bluekey exchange payload (session/introspection material); returns `200` with local token/user session.
- `POST /api/refresh-token`: expects `refreshToken`; returns `200` with new access token (and rotation metadata when applicable).
- `POST /api/refresh-tokens/revoke`: expects auth header and optional target user id (admin path); returns `200` with revoked token count/result.
- `POST /api/forgot-password`: expects `email`; returns `200` with reset challenge/start confirmation.
- `POST /api/reset-password/verify`: expects `email` plus challenge factors (security answers and/or TOTP as configured); returns `200` with reset verification token.
- `POST /api/reset-password`: expects `email`, `newPassword`, plus verified reset token/challenge fields; returns `200` password reset success.
- `POST /api/passkey/register-options`: expects `email`; returns `200` WebAuthn registration options/challenge.
- `POST /api/passkey/register-verify`: expects WebAuthn registration response payload; returns `200` passkey registration success.
- `POST /api/passkey/auth-options`: expects account identity hint (or none for discoverable credentials); returns `200` WebAuthn auth options/challenge.
- `POST /api/passkey/auth-verify`: expects WebAuthn assertion response; returns `200` with login token/user session.
- `POST /api/totp/setup`: expects `email`; returns `200` with TOTP setup secret/QR metadata.
- `POST /api/totp/verify-setup`: expects `email`, `token`; returns `200` confirming TOTP setup completion.
- `POST /api/totp/auth`: expects `email`, `token`; returns `200` with login token/user session.
- `POST /api/user/auth-method`: expects user identity context (typically email/user lookup inputs); returns `200` with effective auth method.
- `GET /api/user/profile`: expects bearer token; returns `200` with account + profile data.
- `PATCH /api/user/profile`: expects bearer token and optional `firstName`, `lastName`, `bio`, `avatarUrl`; returns `200` updated profile.
- `POST /api/user/change-password`: expects bearer token, `currentPassword`, `newPassword`; returns `200` password change success.
- `PATCH /api/user/email`: expects bearer token, `newEmail`, `password`; returns `200` email-change workflow result.
- `GET /api/users`: expects bearer token; returns `200` list of users visible to requester.
- `DELETE /api/user/account`: expects bearer token, `password`, `confirmText=DELETE_MY_ACCOUNT`; returns `200` account deletion result.
- `POST /api/user/deactivate`: expects bearer token and `password`; returns `200` account deactivation result.
- `POST /api/user/reactivate`: expects credentials (`email`/identity and `password` path); returns `200` account reactivation result.
- `GET /api/user/export`: expects bearer token; returns `200` exported user data payload.

### Documents And Uploads

- `POST /api/documents/create`: expects bearer token and document metadata (`title`, optional `author`, `publicationYear`); returns `201`/`200` with `documentId`.
- `GET /api/documents/resolution`: expects bearer token; returns `200` rendering/resolution config.
- `POST /api/documents/upload`: expects bearer token and multipart PDF (`pdf`) plus metadata fields; returns `201`/`200` with created document/page summary.
- `POST /api/documents/upload-images`: expects bearer token and multipart images (`images[]`) plus metadata; returns `201`/`200` with created document/page summary.
- `GET /api/documents/upload/progress/:documentId`: expects bearer token and document id path param; returns `200` upload/progress state.
- `GET /api/documents`: expects bearer token; returns `200` list of documents scoped by ownership/permissions.
- `GET /api/documents/:id/download`: expects bearer token + viewer access; returns file stream/download response.
- `GET /api/documents/:id/pages`: expects bearer token + viewer access; returns `200` array of page records.
- `PUT /api/documents/:documentId/pages/save`: expects bearer token + editor access + full page save payload; returns `200` save result.
- `PUT /api/documents/:documentId/pages/:pageId`: expects bearer token + editor access + page update payload; returns `200` updated page record.
- `POST /api/documents/:documentId/pages/upload`: expects bearer token + editor access + multipart `image`; returns `201`/`200` new page metadata.
- `POST /api/documents/:documentId/pages/upload-multiple`: expects bearer token + editor access + multipart `images[]`; returns `201`/`200` batch upload summary.
- `PATCH /api/documents/:id`: expects bearer token + editor access and at least one of `title`, `author`, `publication_year`; returns `200` updated document metadata.
- `DELETE /api/documents/:id`: expects bearer token + owner authorization path; returns `200` deletion success.

### Annotations, Layers, Glyphs, Corrections

- `POST /api/annotations/batch`: expects bearer token and `document_id`, `page_id`, `annotations[]` (with trace payload); returns `200` batch replace/upsert summary.
- `GET /api/documents/:id/annotations`: expects bearer token + viewer access; returns `200` document annotation list.
- `GET /api/documents/:documentId/pages/:pageId/annotations`: expects bearer token + viewer access; returns `200` page annotation list.
- `POST /api/pages/:pageId/annotations`: expects bearer token and page-level annotation payload; returns `201`/`200` created annotation.
- `POST /api/annotations`: expects bearer token and single annotation payload (`document_id`, `page_number`, `annotation_type`, etc.); returns `201`/`200` created annotation.
- `GET /api/documents/:id/layers`: expects bearer token + viewer access; returns `200` annotation layers.
- `POST /api/layers`: expects bearer token + editor access + layer payload (`document_id`, `name`, optional visibility/z-index); returns `201`/`200` created layer.
- `POST /api/documents/:documentId/glyphs/merge`: expects bearer token + editor access + merge payload (`pageId`, stroke ids, optional metadata); returns `200` merged compound glyph annotation.
- `DELETE /api/documents/:documentId/glyphs/:glyphId/unmerge`: expects bearer token + editor access; returns `200` unmerge success and restored strokes.
- `POST /api/corrections/batch`: expects bearer token + correction items with predicted/corrected class metadata; returns `200` inserted corrections summary.
- `GET /api/documents/:documentId/corrections/analytics`: expects bearer token and document id; returns `200` correction analytics aggregates.
- `POST /api/glyph-groups`: expects bearer token and `documentId`, `pageId`, `groupName`; returns `201`/`200` created group.
- `GET /api/documents/:documentId/pages/:pageId/glyph-groups`: expects bearer token; returns `200` groups with member summaries.
- `PUT /api/glyph-groups/:id`: expects bearer token and mutable group fields (typically `groupName`); returns `200` updated group.
- `DELETE /api/glyph-groups/:id`: expects bearer token and ownership; returns `200` delete success.
- `POST /api/glyph-groups/:id/members`: expects bearer token and `strokeId`, optional `is_ground_truth`, `similarity_score`; returns `201`/`200` created membership.
- `DELETE /api/glyph-groups/:id/members/:strokeId`: expects bearer token and ownership; returns `200` member removal success.
- `POST /api/glyph/predict`: expects bearer token and classifier payload (`glyphs`, trained `glyphGroups`); returns `200` predictions matrix.

### Theories And Dictionary

- `POST /api/theories`: expects bearer token and `document_id`, optional `name`; returns `201`/`200` created theory.
- `PATCH /api/theories/:id`: expects bearer token and mutable fields (e.g., name/metadata); returns `200` updated theory.
- `DELETE /api/theories/:id`: expects bearer token and ownership; returns `200` deletion success.
- `GET /api/theories`: expects bearer token; returns `200` requester-visible theories.
- `GET /api/theories/users`: expects bearer token; returns `200` user list used for theory context.
- `GET /api/theories/:theoryId`: expects bearer token; returns `200` theory detail.
- `GET /api/documents/:documentId/theories`: expects bearer token; returns `200` theories for a document.
- `PUT /api/theories/:theoryId/transcriptions`: expects bearer token and transcription map payload; returns `200` upsert summary.
- `GET /api/theories/:theoryId/transcriptions`: expects bearer token; returns `200` transcription records.
- `GET /api/dictionary`: expects bearer token; returns `200` dictionary entries (owner-scoped).
- `POST /api/dictionary`: expects bearer token and entry payload (`word`, optional `ipa`/`transcription`, `translation`); returns `201`/`200` created entry.
- `PUT /api/dictionary/:id`: expects bearer token and update payload; returns `200` updated entry.
- `DELETE /api/dictionary/:id`: expects bearer token and owner check; returns `200` deletion success.

### Chat, Moderation, EULA, Activity

- `POST /api/documents/:documentId/history`: expects bearer token and history change payload (`item_id`, `item_type`, `change_type`, snapshots); returns `201`/`200` created history row.
- `POST /api/documents/:documentId/chats/bot`: expects chat payload for bot message generation context; returns generated/recorded chat message output.
- `GET /api/documents/:documentId/chats`: expects bearer token; optional query (`before_id`, `limit`); returns `200` chronological chat messages.
- `POST /api/documents/:documentId/chats`: expects bearer token and `message`, optional `pageNumber`; returns `200` with success/message metadata.
- `POST /api/documents/:documentId/report-user`: expects bearer token and report payload (`reportedUserId`, `reason`, optional `description`, `chatId`, severity); returns `201`/`200` report record.
- `GET /api/documents/:documentId/flagged-chats`: expects bearer token; returns `200` flagged moderation queue entries.
- `POST /api/documents/:documentId/flagged-chats/:flagId/action`: expects bearer token and moderation action (`approve`/`remove` style), optional ban context; returns `200` action result.
- `GET /api/documents/:documentId/user-ban-status/:userId`: expects bearer token; returns `200` current ban status object.
- `GET /api/documents/:documentId/bans`: expects bearer token; returns `200` active/known bans.
- `DELETE /api/documents/:documentId/bans/:banId`: expects bearer token and moderator/owner authorization; returns `200` unban success.
- `GET /api/documents/:documentId/activity`: expects bearer token; returns `200` document activity rows.
- `PUT /api/documents/:documentId/activity`: expects bearer token and activity payload (`tool`, `page_id`, `theory_id`, etc.); returns `200` upserted activity state.
- `GET /api/eula/status`: expects bearer token; returns `200` acceptance status for current user/version.
- `POST /api/eula/accept`: expects bearer token and acceptance metadata (version/client context as needed); returns `200` acceptance persisted.

### Teams, Permissions, Notifications

- `POST /api/teams`: expects bearer token and `name`, optional `description`; returns `201` created team.
- `GET /api/teams`: expects bearer token; returns `200` teams visible to requester.
- `GET /api/teams/:id`: expects bearer token; returns `200` team detail including membership context.
- `PATCH /api/teams/:id`: expects bearer token and mutable team fields (`name`, `description`); returns `200` updated team.
- `DELETE /api/teams/:id`: expects bearer token + ownership/admin rights; returns `200` deletion success.
- `POST /api/teams/:id/invites`: expects bearer token and one of `username` or `email`, plus `role`; returns `201` invite created.
- `GET /api/teams/:id/invites`: expects bearer token; returns `200` team invite list.
- `DELETE /api/teams/:id/invites/:inviteId`: expects bearer token; returns `200` invite revoked/deleted.
- `GET /api/users/:username/pending-invites`: expects bearer token and username path target; returns `200` pending invites.
- `POST /api/teams/:id/members/:memberId/accept`: expects bearer token and acceptance context; returns `200` membership accepted.
- `POST /api/teams/:id/members/:memberId/leave`: expects bearer token; returns `200` member left/removed result.
- `POST /api/teams/:id/members/join`: expects bearer token and join context (invite/public team path); returns `200` membership result.
- `PATCH /api/teams/:id/members/:memberId/role`: expects bearer token and `role` in (`member`,`editor`,`admin`); returns `200` role update success.
- `GET /api/user/teams`: expects bearer token; returns `200` current user team memberships.
- `PATCH /api/documents/:id/ownership`: expects bearer token and `new_owner_id`, optional `preserve_team`; returns `200` ownership transfer result.
- `POST /api/documents/:id/permissions/grant`: expects bearer token and `user_id`, `permission_level` (`viewer` or `editor`); returns `201`/`200` permission grant.
- `GET /api/documents/:id/permissions`: expects bearer token; returns `200` direct permission entries.
- `PATCH /api/documents/:id/permissions/:permissionId`: expects bearer token and `permission_level`; returns `200` updated permission.
- `DELETE /api/documents/:id/permissions/:permissionId`: expects bearer token; returns `200` permission revoked.
- `POST /api/documents/:id/teams/grant`: expects bearer token and `team_id`, `access_level`; returns `201`/`200` team grant result.
- `GET /api/documents/:id/teams`: expects bearer token; returns `200` team grants for document.
- `PATCH /api/documents/:id/teams/:teamId`: expects bearer token and team access update payload; returns `200` updated team grant.
- `DELETE /api/documents/:id/teams/:teamId`: expects bearer token; returns `200` team grant removal success.
- `GET /api/notifications`: expects bearer token; returns `200` notifications for user.
- `PATCH /api/notifications/:id`: expects bearer token and patch fields (commonly read state); returns `200` updated notification.

### Audit And Sync

- `POST /api/audit`: expects bearer token and audit event payload (`action`, optional description/metadata); returns `201`/`200` audit record accepted.
- `POST /api/sync/operations`: expects bearer token and operation batch with idempotency keys; returns `200` operation-by-operation apply summary.

### Common Error Responses

- `400`: validation failed or malformed request.
- `401`: missing/invalid bearer token for protected route.
- `403`: authenticated but not permitted for target resource/action.
- `404`: target entity not found.
- `409`: conflict (duplicate or state collision).
- `429`: rate limit exceeded.
- `500`: unexpected server error.
