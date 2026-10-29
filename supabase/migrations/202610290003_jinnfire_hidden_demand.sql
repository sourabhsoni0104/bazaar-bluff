-- Organisers can hide a round's demand from players until the round's results are published.
alter table game_private.jinn_rounds add column if not exists demand_hidden boolean not null default false;
insert into game_private.schema_migrations(version) values('202610290003_jinnfire_hidden_demand') on conflict do nothing;
