# Oasis ’26 · Bazaar Bluff & Jinnfire Exchange

A responsive two-game event platform with a shared organiser console. Themed on the Oasis ’26 Bazaar Bluff poster: royal violet night sky, the poster’s own “Bazaar Bluff” lettering traced to SVG, gold-line playing cards, the painted five-territory map and a golden minaret skyline (`public/oasis.css`), with locally hosted DM Sans and Amarante fonts, private team submissions and server-owned round controls.

## Open locally

- Games: http://localhost:3000/games
- Shared organiser panel: http://localhost:3000/admin
- Bazaar Bluff: http://localhost:3000
- Bazaar team screen: http://localhost:3000/team
- Jinnfire Exchange: http://localhost:3000/jinnfire
- Public Bazaar projector: http://localhost:3000/display
- Event poster: http://localhost:3000/event

Run `npm start` to start the server. Node 22+ and PostgreSQL are required for the two-game backend. Dependencies are listed in package.json.

The current `.env` points to the dedicated local PostgreSQL database `bazaar_bluff_dev`. Existing Bazaar data was imported once into a transactional private JSONB aggregate, preserving the old `state.json` as a backup. New Jinnfire data is relational. Cloud Supabase and real Google login are not connected yet; see [the setup guide](docs/SUPABASE-SETUP.md).

## Organiser access

Open `/admin`. For the current local development build, click **Local organiser login** and use the `ADMIN_PASSWORD` value in the private `.env` file. The password is never shown on the site. Production uses verified Google accounts from `ADMIN_EMAILS`; local password/demo authentication is disabled in production.

The admin panel has separate game tabs:

**Bazaar Bluff:** every player is a Google account on the sign-in list; there are no party codes, PINs or team names to choose. The first time a player signs in the server creates their player record. Organisers build the tables (three to five players each): add, rename and delete tables, seat players, move or reorder them, auto-seat anyone unseated, rename or remove players. Tables are locked while a round is running and editable before round 1 and between rounds. Rounds are synced: the organiser presses **Start round N** and every table enters the proposal phase at the same moment on one shared clock, then moves through voting, results, deployment and battle together. When the battle ends the game waits at *Round complete* until the organiser starts the next round. Organisers can also pause/resume, add a minute, skip to the next phase, add a round, edit core settings and export closed-round data. Players negotiate a 400-point pot with the others at their table, vote anonymously and deploy troops across five territories. The PDF example scores A 0, B 100, C 900, D 500. Scores belong to the player, so they carry over when tables are reshuffled between rounds.

**Jinnfire Exchange:** the second event. It stays closed to players until an organiser presses **Open to players** on the admin panel’s Jinnfire tab; until then the server refuses every Jinnfire request from non-organisers and rounds cannot start. Every signed-in Google account plays for themselves (no teams or access codes): a player is created the first time they open the game while it is open. Organisers can prepare positive demand, start a 120-second round, pause/resume for all players with an audit reason, end early with a reason, cancel explicitly, publish settled results, rename or remove players with confirmation and inspect private calculation/audit tables. A normal deadline automatically settles and publishes. Each player's output is an integer from 0 to 15; missing output defaults to zero. Profit uses `10 × [2 − (Q/D)²]` for every unit. Negative profit counts. Fractions are calculated exactly for fair cumulative ranking and ties. Public results contain only player names and competition ranks.

## Database and Google setup

See [.env.example](.env.example) for variable names and [docs/SUPABASE-SETUP.md](docs/SUPABASE-SETUP.md) for project creation, migrations, Google callback URLs, first-admin setup and production requirements. `npm run db:migrate` applies versioned private-schema migrations. All mutations commit before a success response; failed writes roll back. RLS is enabled and raw private tables are denied to browser roles. Supabase's service-role key is not needed in client code; database credentials stay on the server.

Google sign-in code uses the server-side Supabase SDK and PKCE, HttpOnly cookies, verified identities and a server-side admin allowlist. The real hosted project and Google provider must be configured and tested before Google login can be called working. The UI reports this honestly.

## Working on the code

[docs/CODEBASE.md](docs/CODEBASE.md) maps the files, data model, routes and the places to change common settings, visibility and wording.

## Verification

```sh
npm test
npm run test:browser
```

Tests use `bazaar_bluff_test` (or `TEST_DATABASE_URL`), separate from the local event. The browser runner creates isolated events and state keys, runs both game flows, and shuts down its fixture server. API legacy tests explicitly clear cloud credentials to avoid touching a real event. Browser screenshots include `two-game-admin.png`, `jinnfire-player.png` and `jinnfire-results-mobile.png`.

## Remaining event work

Hosted Supabase creation, Google OAuth configuration, approved organiser emails, actual end-to-end Google verification, production deployment and venue-network/device load testing remain dependent on account/configuration access. The live cloud connection is not claimed as complete.

Some advanced Bazaar-only features from the original PDF are still outside this implementation: CSV roster import, drag/drop reassignment, arbitrary phase skips, complete entry override editors, every configurable timer/battlefield through settings, author-reveal controls and in-app full closed-round audit inspection. Existing core table/round gameplay and Jinnfire's required controls are implemented. Do not treat the local checks as a live-event production sign-off.

The original briefs, video-informed decisions and artwork prompts are recorded under `docs/`. Secrets, runtime JSON and database dumps must stay private. No wallet actions, payments, external messages or public deployment are part of this work.
