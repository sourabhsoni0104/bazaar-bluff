# Codebase reference

A map of the repo for making changes without re-reading everything. Last checked against the players / tables / synced-rounds rework. Function names are stable; line numbers drift, so search for the name.

## What it is
Oasis ’26 event platform with two games and one admin panel.
- **Bazaar Bluff**: players are seated at tables of 4 or 5, negotiate a 400-point pot, vote, deploy troops on five territories. Rounds are started by the organiser for every table at once.
- **Jinnfire Exchange**: every player picks a production quantity 0–15; a shared market formula settles profit.

Stack: plain Node 22 (`http`, no framework) + `pg`, Supabase for Google sign-in only, a no-build vanilla JS single-page app, deployed on Vercel (Mumbai) with Supabase Postgres. Everything is minified into very long lines, so edit with exact string replacement, not by line.

## Layout
| Path | What lives there |
|---|---|
| `server.mjs` | Entire Bazaar backend and the HTTP handler: state shape, round engine, `view()`, all `/api/*` routes, admin actions |
| `rules.mjs` | Pure Bazaar rules: `scoreBattle`, `chooseProposals`, `combineShares`, `validAllocation` |
| `backend/jinnfire.mjs` | Jinnfire service (SQL): `enroll`, `submit`, `control`, `view`, `tick`, `settle` |
| `backend/jinnfire-rules.mjs` | Pure Jinnfire maths (exact fractions): `settleMarket`, `rankScores`, `validQuantity` |
| `backend/auth.mjs` | Google sign-in via Supabase (`/auth/*`), `roleForUser`, sign-in allowlist hook |
| `backend/database.mjs` | Pool, `migrate`, `transaction`, `makeStateStore` (JSONB aggregate store) |
| `backend/env.mjs` | Maps Vercel/Supabase variable names to `DATABASE_URL` etc. |
| `api/index.mjs` | Vercel entry; re-exports the `server.mjs` handler |
| `supabase/migrations/` | Applied in filename order on every cold start (`migrate`); latest is `202610290004_jinnfire_score_offsets` |
| `public/app.js` | Player UI, shell/nav, Bazaar pages, polling, click/submit handlers |
| `public/platform.js` | Games hub, admin panel (Bazaar tables editor, allowlist, Jinnfire admin), Jinnfire player page |
| `public/*.css` | `style.css` → `premium.css` → `typography.css` → `platform.css` → `oasis.css`, loaded in that order, later wins |
| `tests/` | `node --test`; see Testing |
| `browser-check.mjs`, `platform-browser-check.mjs`, `visual-check.mjs`, `scripts/browser-qa.mjs` | Playwright checks |

## Data
- **Bazaar** is one JSONB document: table `game_private.bazaar_state`, row `bazaar-live` (`BAZAAR_STATE_KEY` overrides). Every mutating request runs inside `store.run`, which locks the row, runs the handler, writes back if the JSON changed, then notifies. Shape:
  - `settings`: pot, rounds, fallback, tie, timers, fields, `jinnfireOpen`
  - `game`: `{round, phase, deadline, paused, remaining}`; **one global clock**. Phases: `lobby → proposal → voting → results → deployment → battle → between → finished`
  - `players[]`: `{id, userId, email, name, score, wins, history}`; score lives on the player
  - `tables[]`: `{id, name, seats:[playerId], proposals, votes, deployments, locks, armies, outcome, battle, archive}`
  - `pastTables[]`: `{id, name, seats:[], archive}` for deleted tables that had played, so their history still feeds `highlights` and the player recap
  - `allowedEmails[]` (sign-in list), `audit[]`, `sessions{}` (local-dev logins only)
- **Jinnfire** is relational (`game_private.jinn_*`). `jinn_teams` rows are *players* (name kept for history); `owner_id` is the Google user id. Rounds: `ready → live → settled → published | cancelled`.
- With no `DATABASE_URL` the Bazaar store falls back to a JSON file (`DATA_FILE`, default `state.json`), used by API tests and local runs. Jinnfire needs Postgres.

## Request flow
Browser `api()` → `/api/*` → `handler` in `server.mjs` → Google identity (`googleAuth.identify`) → either Jinnfire (`jinn.*`, own transaction) or `store.run(snapshot => {advanceDue(); handleRequest()})`. Responses are buffered until commit. The client polls `/api/state` every 2 s (`sync()` in `app.js`) and re-renders when the JSON changes. `/api/jinn/state` is fetched every poll only on Jinnfire-facing pages (`jinnfire`, `jinnfire-display`, `games`, `display`, the non-Bazaar leaderboard tabs) or for organisers, otherwise every 10 s, and not at all while Jinnfire is closed to players. A hidden tab polls every 15 s and catches up on `visibilitychange`.

Load savers: `googleAuth.identify` (`auth.mjs`) reuses a confirmed identity for 20 s per Supabase cookie (a refreshed cookie is a new key) and keeps the last answer for up to 10 min if Supabase is unreachable; `store.read` (`database.mjs`) only transfers the JSONB document when its `version` differs from what this instance last read. `store.run` sets `lock_timeout` 3 s and `statement_timeout` 15 s, so when writes pile up on the single state row they fail fast with "The game is busy" (503) instead of holding connections. Phases advance lazily: `advanceDue()` runs on each request (and a 1 s interval when run with `npm start`; **not** on Vercel).

## Roles
`public` (not signed in) · `user` (Google, on the allowlist) · `team` (local-dev login only) · `admin` (email in `ADMIN_EMAILS`). Admin is decided only in `roleForUser`. Non-admins must be on `allowedEmails`, checked in the auth callback and again in `identity()`.

## Routes (server.mjs)
- Public/player: `GET /api/state`, `GET /api/leaderboards`, `POST /api/enroll`, `POST /api/profile` (player sets their display name once; needs `confirm:true`, then `nameLocked`), `POST /api/entry`, `GET /api/events` (SSE), `GET /api/health`
- Jinnfire: `GET /api/jinn/state`, `POST /api/jinn/enroll | submit | control`
- Admin: `POST /api/control` (all organiser actions, switch on `b.action`), `GET /api/export` (full JSON record; mid-round the running round's entries are blanked), `GET /api/export/scores.csv` (`scoreSheet()`: rank, player, email, table, total, territories, one column per closed round from the archives), `GET /api/jinn/export.csv` (`jinn.exportSheet()`: quantity and profit per published round, adjustment, total). CSV goes through `csv()`, which adds a BOM and prefixes formula-like text with `'`. Admin links carry `data-download`; the click handler in `app.js` fetches them and shows errors as a toast instead of navigating to raw JSON.
- Local dev only: `POST /api/admin/login`, `POST /api/demo`, `POST /api/logout`
- Auth: `/auth/google`, `/auth/callback`, `/auth/logout` (`backend/auth.mjs`)

`/api/control` actions: `settings, add-round, reset-event (confirm:true, not mid-round or with a live Jinnfire round: round 0 lobby, every Bazaar player, table and round deleted, Jinnfire wiped via `jinn.wipe()` and closed; allowlist, settings and audit logs kept; signed-in players re-enroll as new), allow-emails, disallow-email, jinnfire-access, start-round, advance, pause, extend, end, table-create, table-rename, table-delete, seat, auto-seat, player-rename, player-remove, player-score, reset-scores`. Table and player edits call `assertEditable()` and fail while a round is running. `auto-seat` tops up tables below 4, opens new tables of 4, then spreads any remainder (up to 5 per table); it returns `{seated,unseated}`.

## Where to change common things
| Want to change | Change this | Notes |
|---|---|---|
| Pot, rounds, fallback army, tie rule | `settings` in `server.mjs` (defaults) or the `/settings` page | The constant only seeds a **new** save. Live values are stored in the database and edited from the settings page, which locks during a round. |
| Phase timers (proposal 180 s, voting 120, results 45, deployment 180, battle 60) and battlefield names/values | `settings.timers`, `settings.fields` in `server.mjs` | **Not editable from the UI**, and changing the constant does not affect an existing save. A live change needs a settings action or a one-off edit of the stored JSON. |
| Seats per table (4–5) | `MIN_SEATS`/`MAX_SEATS` in `server.mjs` (used by `startRound`, `seat`, `auto-seat`); `MIN`/`MAX` and copy in `bazaarAdmin` (`platform.js`), `tablesPage` | Passing logic does not depend on table size. |
| Who sees what (Bazaar) | `view()` in `server.mjs` | Proposals only in voting and after; others’ entries never; `email` admin-only; `allowedEmails`/`audit` admin-only. |
| Who sees what (Jinnfire) | `view()` in `backend/jinnfire.mjs`; open/closed gate in the `/api/jinn/` block of `handler` | Public board rows are rank, name and `points` (round profit on the round board, running total on the overall board); quantities stay private. |
| Sidebar links and who gets them | `shell()` in `app.js` (`nav` array) | Admin links only when `state.role==='admin'`. Hiding a link does not secure a route; the server checks `auth.role`. |
| Page wording, phase names | `phaseName`, `rulesPage`, `eventPage` in `app.js`; `gamesPage`, `jinnPage` in `platform.js` | |
| Round length and quantity range (Jinnfire) | `start` in `jinnfire.mjs` (`120000`), `validQuantity` in `jinnfire-rules.mjs`, the `0..15` check in the migration | Also text in `platform.js` and the `120` fallback in `clock()` in `app.js`. |
| Profit formula | `settleMarket` in `backend/jinnfire-rules.mjs` | Tests in `tests/jinnfire-rules.test.mjs`. |
| Bazaar scoring | `scoreBattle` / `chooseProposals` / `combineShares` in `rules.mjs` | Tests in `tests/rules.test.mjs`. |
| Limits and rate limits | 1000 players, 100 tables, 5000 emails in `server.mjs`; `rate(req,subject,user)` (300/min and 10/min per action) | Keyed on the account when `user` is passed (`enroll`, `profile`, `jinn-enroll`), so a venue on one Wi-Fi address is not throttled together; otherwise on the IP (local admin login, demo). |
| Polling speed | `poll`/`setInterval(...,2000)` at the end of `app.js`; Jinnfire cadence in `sync()` (`jinnLive`) | |
| Colours, spacing, admin layout | `platform.css` (admin, table editor), `oasis.css` (theme, allowlist), `premium.css` | Bump the `?v=` on the link in `public/index.html` and the `platform.js?v=` import in `app.js` so browsers reload. |
| Add an admin action | New `else if(a==='…')` branch in the `/api/control` block; button in `platform.js`; a test in `tests/api.test.mjs` | Use `assertEditable()` if it edits tables or players. |
| Add a database column or table | New file in `supabase/migrations/` named `YYYYMMDDNNNN_name.sql` ending with an insert into `schema_migrations` | Never edit an applied migration. |

## Environment
`.env.example` lists everything. Key ones: `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `ADMIN_EMAILS`, `SITE_URL`, `ADMIN_PASSWORD` + `ALLOW_LOCAL_ADMIN` (local development only; disabled when `NODE_ENV=production`). Vercel integration names (`BB_POSTGRES_URL` etc.) are mapped in `backend/env.mjs`.

## Commands
- `npm start`: run locally (http://localhost:3000, admin at `/admin`)
- `npm test`: all tests. Needs Postgres at `TEST_DATABASE_URL` (default `postgresql:///bazaar_bluff_test?host=/tmp`) for the database suites.
- `node --test tests/api.test.mjs tests/rules.test.mjs tests/auth.test.mjs tests/jinnfire-rules.test.mjs`: the suites that need **no** database
- `npm run db:migrate`: apply migrations
- `npm run test:browser`: Playwright checks (needs Postgres). `browser-check.mjs` (Bazaar) can also run against a file-store server with `BASE_URL`, `QA_ADMIN_PASSWORD` and `CHROMIUM_PATH` set.

## Testing notes
- `tests/api.test.mjs` spawns `server.mjs` with no database, uses the local test-player login (`/api/demo`) to make players, and drives `/api/control` as the organiser. Copy its helpers (`call`, `newPlayer`, `seat`, `control`) for new Bazaar tests.
- `tests/jinnfire-database.test.mjs`, `production.test.mjs`, `store.test.mjs`, `privacy-database.test.mjs` need Postgres.
- Playwright scripts hard-code nothing machine-specific; point `CHROMIUM_PATH` at a local Chromium if the default channel is missing.

## Gotchas
- **Dense one-line style.** Match it. Prefer exact-string edits; do not reformat a file.
- **Module-level `state`** in `server.mjs` is reassigned per request (`state=snapshot`). It is safe inside `store.run`/`store.read` callbacks; do not use it across an `await` outside them.
- **Settings persist.** Defaults in code never overwrite a saved value (see Where to change).
- **Taking a player off a table** is `seat` with `table:null`; they stay a player and on the allowlist. The admin UI no longer offers `player-remove` (it deletes the record but leaves the allowlist, so a signed-in player would re-enroll on the next poll with a zero score).
- **Most approvals passes; ties add.** No percentage threshold: the proposal(s) with the most approvals pass, tied leaders all pass and each seat's army is the sum of its shares (`combineShares`), and with zero approvals everywhere the fallback army applies. `outcome` is `{counts,winners:[…]}` (older saves had `winner`/`draw`; `results()` still reads them).
- **Voting is approve-only.** The client sends booleans per proposal; anything not approved (including no vote at all) counts as a rejection at the deadline. A battlefield where nobody sent troops has no winner and scores nothing (`scoreBattle`).
- **Proposal drafts.** `/api/entry` accepts a proposal draft (`lock:false`) at any whole-number total up to the pot; locking needs the whole pot. An all-zero draft withdraws the player's proposal. At proposal → voting, `advanceGame` spreads any unallocated points evenly (`equal()`) before the Fisher–Yates `shuffle()`. The client saves drafts on its own (`scheduleSave`/`saveDraft` in `app.js`): the debounce shrinks as the deadline nears (2.5 s, 1 s, then 0.4 s under 10 s) and `deadlineWatch` (run from `clock()`) sends anything unsent in the last 4 s. Drafts only send once the player has touched the entry, so an untouched deployment still gets the even default.
- **Tables of five score ×5/4.** At deployment → battle each table's field values are multiplied by `seats/MIN_SEATS`, so `battle.scale` is 1.25 at five seats and a seat is worth the same at any size. Auto-seat already fills tables of four first and only puts the 1–3 left-over players onto the last tables as fifth seats.
- **Round recap.** In battle/between/finished, `view()` builds `mine.battle` from the archive entry of the current round that contains the player (`seats` names and `slot` included), so reseating or deleting tables between rounds never changes or breaks it.
- **Allocation inputs** are clamped in the `input` handler in `app.js` to whole numbers between 0 and what is left; the server still rejects anything else (`validAllocation`).
- **Display names are chosen once.** A player's `nameLocked` is false until they confirm a name (`nameDialog` in `app.js` opens on login, also on `/profile`); `/api/profile` then locks it. Only an organiser (`player-rename`) can change it afterwards. Existing players with `nameLocked` unset are asked once. Jinnfire uses the same name: `enroll` takes it from the Bazaar player and `syncJinnName` (server.mjs) pushes later changes through `jinn.setName`. The Jinnfire admin roster no longer offers Rename.
- **Jinnfire hidden demand.** `jinn_rounds.demand_hidden` (set with `hideDemand` on `prepare` / `set-demand`) makes `view()` return `round.demand:null` to non-admins until the round is `published`. After publish, `view().result` (`{number,supply,demand,rate,players}`) and `mine.profit` / `mine.total` drive the end-of-round reveal in `jinnPage`/`roundStory` (`platform.js`). Other players' quantities stay private; everyone's profit and total are on the public boards.
- **Jinnfire points.** `/api/jinn/control` `set-score` (`playerId`, numeric `score`) and `reset-scores` need `confirm:true` and a reason, and are refused while a round is live or settled-but-unpublished. They write `jinn_score_offsets` (migration `…0004`); a player's total is the latest published cumulative profit plus the offset (`totals()` in `jinnfire.mjs`), so round results are never edited and later rounds add on top. Bazaar has its own `player-score` / `reset-scores` in `/api/control`.
- **Leaderboards page** (`leaderboardsPage` in `app.js`) has three tabs: Bazaar (`leaderTable`), Jinnfire (`boardTable`, rank and profit/loss) and Combined. Combined comes from public `GET /api/leaderboards`, fetched only while that tab is open: `combineBoards` in `rules.mjs` multiplies the Bazaar score by a Jinnfire multiplier from a normalised Jinnfire score: (total − median) ÷ spread, where spread is 1.4826 × median absolute deviation (mean absolute deviation × 1.2533 if more than half the room is level). Multiplier = 1 + `JINN_STEP` (0.1) × that, capped to 1 ± `JINN_LIMIT` (0.5). Players with no Jinnfire total keep ×1. Players are matched by Google account (`userId` = `owner_id`). Jinnfire is left out until it is open to players. Rows carry `multiplier`; Jinnfire totals are public on the Jinnfire board anyway.
- **Projectors.** `/display` (Bazaar, `displayPage`) and `/jinnfire-display` (`jinnDisplayPage`) both end with `projectorBoards()`: Bazaar top 10, Jinnfire overall ranks and the combined board, side by side. Both pages poll `/api/leaderboards` for the combined board. The Jinnfire projector also shows the clock, round status and last-round result (fed by `/api/jinn/state`).
- **Jinnfire `remove-player`** only deactivates the row; the player cannot be re-enrolled.
- **Accessibility.** `render()` restores keyboard focus to the same control after re-rendering (`focusKey`/`restoreFocus`, matched on `data-*` attributes in `focusAttrs`). `#announcer` in `index.html` is a polite live region: `announcePhase` speaks Bazaar phase changes (and Jinnfire round changes on Jinnfire pages), `deadlineWatch` a 30-second warning. Never put the ticking clock in a live region.
- **Phases advance on requests**, so on Vercel a due phase moves the next time anyone loads the page. Players polling every 2 s make this effectively immediate.
- Legacy saves with `groups` (the old party model) are ignored by `normalise()` in `server.mjs`.
- Do not commit `.env`, `state.json`, dumps, or screenshots; they are git-ignored or should stay out.
