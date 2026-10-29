-- Private application data. Browsers never read these tables directly.
create schema if not exists game_private;
revoke all on schema game_private from public;
create table if not exists game_private.schema_migrations(version text primary key, applied_at timestamptz not null default now());
create table if not exists game_private.bazaar_state(
 id text primary key, payload jsonb not null check(jsonb_typeof(payload)='object'), version bigint not null default 0, updated_at timestamptz not null default now()
);
create table if not exists game_private.jinn_events(
 id uuid primary key default gen_random_uuid(), name text not null, created_at timestamptz not null default now()
);
create table if not exists game_private.jinn_teams(
 id uuid primary key default gen_random_uuid(), event_id uuid not null references game_private.jinn_events(id), name text not null check(length(name) between 2 and 60), code_hash text not null unique, code_hint text not null, owner_id uuid, active boolean not null default true, created_at timestamptz not null default now()
);
create unique index if not exists jinn_unique_name on game_private.jinn_teams(event_id,lower(name));
create unique index if not exists jinn_unique_owner on game_private.jinn_teams(event_id,owner_id) where owner_id is not null;
create table if not exists game_private.jinn_rounds(
 id uuid primary key default gen_random_uuid(), event_id uuid not null references game_private.jinn_events(id), number integer not null check(number>0), demand integer not null check(demand between 1 and 1000000), status text not null default 'ready' check(status in('ready','live','settled','published','cancelled')), started_at timestamptz, deadline_at timestamptz, paused boolean not null default false, remaining_ms integer, locked_at timestamptz, settled_at timestamptz, published_at timestamptz, total_supply integer, rate_num numeric, rate_den numeric check(rate_den>0), created_at timestamptz not null default now(), unique(event_id,number)
);
create unique index if not exists jinn_one_open_round on game_private.jinn_rounds(event_id) where status in('ready','live','settled');
create table if not exists game_private.jinn_participants(
 round_id uuid not null references game_private.jinn_rounds(id), team_id uuid not null references game_private.jinn_teams(id), primary key(round_id,team_id)
);
create table if not exists game_private.jinn_submissions(
 round_id uuid not null, team_id uuid not null, quantity smallint not null check(quantity between 0 and 15), saved_at timestamptz not null default now(), locked_at timestamptz, is_default boolean not null default false, primary key(round_id,team_id), foreign key(round_id,team_id) references game_private.jinn_participants(round_id,team_id)
);
create table if not exists game_private.jinn_results(
 round_id uuid not null, team_id uuid not null, quantity smallint not null check(quantity between 0 and 15), profit_num numeric not null, profit_den numeric not null check(profit_den>0), cumulative_num numeric not null, cumulative_den numeric not null check(cumulative_den>0), rank integer not null check(rank>0), primary key(round_id,team_id), foreign key(round_id,team_id) references game_private.jinn_participants(round_id,team_id)
);
create table if not exists game_private.audit_log(
 id bigint generated always as identity primary key, game text not null check(game in('bazaar','jinnfire','auth')), actor text not null, action text not null, round_id uuid, reason text, details jsonb not null default '{}', created_at timestamptz not null default now()
);
create index if not exists jinn_round_event_number on game_private.jinn_rounds(event_id,number desc);
create index if not exists audit_game_recent on game_private.audit_log(game,id desc);
-- Defense in depth: no Data API access, even with a valid signed-in user JWT.
do $$ declare t record; r text; begin
 for t in select tablename from pg_tables where schemaname='game_private' loop
  execute format('alter table game_private.%I enable row level security',t.tablename);
  execute format('revoke all on game_private.%I from public',t.tablename);
  foreach r in array array['anon','authenticated'] loop
   if exists(select from pg_roles where rolname=r) then
    execute format('revoke all on schema game_private from %I',r);
    execute format('revoke all on game_private.%I from %I',t.tablename,r);
   end if;
  end loop;
 end loop;
end $$;
-- Browser roles cannot call application-schema functions or sequences either.
revoke all on all sequences in schema game_private from public;
alter default privileges in schema game_private revoke all on tables from public;
insert into game_private.schema_migrations(version) values('202610290001_games') on conflict do nothing;
