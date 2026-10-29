-- Jinnfire Exchange is played by individual Google accounts. The jinn_teams table keeps its name, but each row is now one player:
-- players enrol themselves when they sign in, so there are no team access codes, and two players may share a display name.
alter table game_private.jinn_teams alter column code_hash drop not null;
alter table game_private.jinn_teams alter column code_hint drop not null;
alter table game_private.jinn_teams add column if not exists email text;
drop index if exists game_private.jinn_unique_name;
create index if not exists jinn_player_name on game_private.jinn_teams(event_id,lower(name));
insert into game_private.schema_migrations(version) values('202610290002_jinnfire_players') on conflict do nothing;
