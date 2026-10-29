-- Organisers can set a Jinnfire player's total points or reset everyone's. Round results stay untouched:
-- a player's total is their latest published cumulative profit plus this offset.
create table if not exists game_private.jinn_score_offsets(
 team_id uuid primary key references game_private.jinn_teams(id), offset_num numeric not null, offset_den numeric not null check(offset_den>0), updated_at timestamptz not null default now()
);
do $$ declare t record; r text; begin
 for t in select tablename from pg_tables where schemaname='game_private' and tablename='jinn_score_offsets' loop
  execute format('alter table game_private.%I enable row level security',t.tablename);
  execute format('revoke all on game_private.%I from public',t.tablename);
  foreach r in array array['anon','authenticated'] loop
   if exists(select from pg_roles where rolname=r) then
    execute format('revoke all on game_private.%I from %I',t.tablename,r);
   end if;
  end loop;
 end loop;
end $$;
insert into game_private.schema_migrations(version) values('202610290004_jinnfire_score_offsets') on conflict do nothing;
