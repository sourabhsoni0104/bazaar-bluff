# Shared two-game backend

Goal: preserve Bazaar Bluff, add the separate Jinnfire Exchange game, a shared organiser console, Google sign-in through Supabase, transactional Postgres persistence and private role-specific APIs.

Implementation:
1. Database: Postgres-backed transaction store for legacy Bazaar state plus normalized Jinnfire event/team/round/submission/result/audit tables; deny direct anonymous/authenticated access to private tables. Server is the only mutation path. Incremental migration and backup keep existing event data. Database transactions serialize legacy mutations and row locks ensure one-time Jinnfire settlement.
2. Authentication: Supabase Google OAuth using PKCE and server-managed HttpOnly cookies. Validate users with getUser; assign organisers only from server-side email allowlist. Team memberships are claimed with existing party code/PIN, then bound to the signed-in account. No role accepted from client or editable user metadata. Local password entry remains only in explicit development mode.
3. Jinnfire: 0–15 integer quantities, fixed 120-second window, immutable positive demand, global pause/resume, missing quantities default zero, exact nonlinear formula, cumulative negative profits, competition ranks, admin-only quantities/numeric results, rank-only public views. Auto-settle at deadline then publish results. Optional early end requires reason and audit.
4. UI: shared /admin with two game tabs, database/auth connection status, live Bazaar control, Jinnfire roster/demand/round operations/audit, /jinnfire team screen and leaderboard. Google login entry, OAuth callback, team claim form. Preserve modern typography/artwork.
5. Verify: worked examples and validation, private API serialization, Postgres transactions/restarts/competing settlement, raw DB grants, auth role checks, legacy regressions, both game flows and admin/browser QA. Build/cloud verification must explicitly distinguish local Postgres from hosted Supabase and real Google OAuth.

Cloud dependency: new Supabase account connection and Google Cloud OAuth configuration require account access. Do not represent the hosted project or Google login as active until actual configuration and end-to-end verification succeed.
