# Supabase and Google sign-in setup

## Current verified state

The application is using real local PostgreSQL (`bazaar_bluff_dev`), not the old JSON file as its live data store. The original JSON data remains untouched as a legacy backup. Jinnfire uses relational event, team, participant, round, submission, result and audit tables; Bazaar Bluff is preserved as a transactional JSONB aggregate in a private database table. The aggregate is row-locked for mutations, making overlapping server writes serializable without rewriting the existing game rules. Both modes roll back failed operations and commit before a successful API response is sent.

The hosted Supabase project has not been created or connected yet. Supabase integration access and organiser Google emails are pending. No Google OAuth end-to-end test has been performed, because that needs a real Supabase project with the Google provider enabled. The UI explicitly distinguishes configured Google authentication from local development login.

## 1. Create a new project

With Supabase account access, create a dedicated event project in the correct organisation. Select a region near the venue and an appropriate available plan; do not provision a paid plan without the owner's choice. Generate a strong database password and keep it only in private local secrets. Do not reuse another application's database.

Get the project URL, publishable key, and a direct/session-pooler database connection string from the project dashboard. This app is a persistent Node server, so use a direct connection or the session pooler on port 5432. Do not use transaction pooling for its LISTEN notification connection. Keep the private `game_private` schema out of exposed Data API schemas.

## 2. Apply the schema

Set `DATABASE_URL` in `.env` to the dedicated project connection string. Configure verified SSL using the provider's connection guidance; never disable certificate verification to suppress an SSL error. On the fresh project:

```sh
npm run db:migrate
```

The migration creates only the `game_private` schema and its own tables, enables RLS, revokes anonymous/authenticated browser privileges and records its version. Migrations use a transaction/advisory lock and skip previously applied versions, avoiding runtime DDL locks on subsequent restarts. No permissive table policy is added. Browser clients use authenticated server endpoints, not direct private-table reads.

## 3. Google provider

In a Google Cloud project owned by the organiser, create an OAuth web client. Configure the consent screen/audience and only the basic `openid`, email and profile scopes. Copy the exact Supabase callback URL from the Google provider settings into Google's authorised redirect URIs, normally:

`https://YOUR-PROJECT-REF.supabase.co/auth/v1/callback`

Enter the Google Client ID and Client Secret in Supabase Authentication → Providers → Google. Google client secrets belong in the provider configuration and should not be pasted into chat or client-side source.

In Supabase Auth URL Configuration, set the intended site URL and allow these exact app callbacks as appropriate:

- Local: `http://localhost:3000/auth/callback`
- Production: `https://YOUR-EVENT-DOMAIN/auth/callback`

Set the application variables:

```dotenv
SUPABASE_URL=https://YOUR-PROJECT-REF.supabase.co
SUPABASE_PUBLISHABLE_KEY=YOUR-PUBLISHABLE-KEY
ADMIN_EMAILS=organiser-one@example.com,organiser-two@example.com
SITE_URL=http://localhost:3000
```

Use actual organiser emails, not these examples. There is no default Google admin account. The server checks Supabase `getUser`, verified email and a Google provider identity, then compares the email with its server-side allowlist. Editable user metadata never grants a role.

## 4. Sign-in and membership

`/auth/google` starts Supabase OAuth with PKCE. `/auth/callback` exchanges the code server-side and stores the session in HttpOnly cookies. The server verifies the current user on API calls. Cookies are Secure on an HTTPS site and use SameSite=Lax for the OAuth return. `/auth/logout` accepts POST, clears authentication and removes the local session cookie.

Google authenticates a person. Team admission is separate:

- Bazaar Bluff: the captain enters the party code, existing team name and PIN. The server hashes/checks the PIN and binds the team to that Google account. An account cannot claim a second Bazaar team, and a linked team cannot be claimed by a different account.
- Jinnfire: the organiser creates a team and receives a high-entropy code once. Only the code hash is stored. The captain enters the code while signed in, binding the Jinnforge to their Google account. Subsequent devices signing in with the same account recover membership automatically.

An account can belong to one team in each game. Teams and score histories remain independent.

## 5. Production requirements

Set `NODE_ENV=production`, an HTTPS `SITE_URL`, the correct Google credentials, `ADMIN_EMAILS` and `DATABASE_URL`. Local password/demo entry is disabled in production even if `ALLOW_LOCAL_ADMIN=true` was accidentally retained. A fresh Supabase-connected or production database starts empty; it does not import local demo data unless explicitly instructed with `IMPORT_LEGACY_STATE=true`.

Run a persistent Node process with supervision and restart on failure. A serverless static host cannot run the continuous deadline loop. Postgres notifications update all running instances after commits; polling remains a fallback. On restart, due rounds are settled automatically from persisted database state. Private data is never included in realtime payloads, which contain only `update` notifications.

Before an event, run a database backup with `pg_dump` using a private connection configuration; keep backups out of the public website directory. Test restore into a separate database. Then verify actual Google login/logout on two devices, admin access denial for a player account, both game flows, venue Wi-Fi, and the chosen deployment host. Do not call the cloud setup or venue capacity verified until those checks actually run.

## Verified local checks

- `npm test`: original worked example, 40 shared-IP registrations, existing privacy/phase behavior, Google identity-to-role restrictions, real PostgreSQL rollback/concurrent writes, denied raw-table reads as anon/authenticated, Jinnfire rational arithmetic, both formula examples, missing/late submissions, negative totals, tied ranks and concurrent idempotent settlement.
- `npm run test:browser`: isolated PostgreSQL fixture server; both admin tabs, creating team codes, separate Jinnfire player join/submission, global pause/resume, settlement/publishing, rank-only results, complete existing Bazaar demo, map interactions and 360px layout. Does not modify the visible event.

## Official references

- [Google sign-in setup](https://supabase.com/docs/guides/auth/social-sign-in/auth-google)
- [Server-side auth clients and cookies](https://supabase.com/docs/guides/auth/server-side/creating-a-client)
- [Database connection modes](https://supabase.com/docs/guides/database/connecting-to-postgres)
- [Row-level security and grants](https://supabase.com/docs/guides/database/postgres/row-level-security)
