-- =============================================================
-- Migration version 1 -> version 2 (groupes)
-- À exécuter UNE SEULE FOIS dans Supabase > SQL Editor, si ta base a été
-- créée avec la première version de schema.sql.
-- Toutes les données sont conservées : participants, liens, exclusions,
-- listes d'idées, tirage déjà effectué, tickets grattés, réservations et messages.
-- =============================================================

begin;

-- 1. Une unité par participant existant
create table units (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references events(id) on delete cascade,
  name       text check (char_length(name) <= 60),
  created_at timestamptz not null default now()
);
create index units_event_idx on units(event_id);

alter table participants add column unit_id uuid references units(id);

create temporary table tmp_map on commit drop as
  select id as participant_id, event_id, gen_random_uuid() as unit_id from participants;
insert into units (id, event_id) select unit_id, event_id from tmp_map;
update participants p set unit_id = m.unit_id from tmp_map m where m.participant_id = p.id;
alter table participants alter column unit_id set not null;
create index participants_unit_idx on participants(unit_id);

-- 2. Le tirage passe de personne à unité ; les tickets grattés vont dans reveals
alter table assignments rename to assignments_v1;
alter table assignments_v1 rename constraint assignments_pkey to assignments_v1_pkey;
alter index assignments_receiver_idx rename to assignments_v1_receiver_idx;
alter index assignments_event_idx rename to assignments_v1_event_idx;

create table assignments (
  event_id      uuid not null references events(id) on delete cascade,
  giver_unit    uuid not null references units(id) on delete cascade,
  receiver_unit uuid not null references units(id) on delete cascade,
  primary key (giver_unit, receiver_unit),
  check (giver_unit <> receiver_unit)
);
create index assignments_receiver_idx on assignments(receiver_unit);
create index assignments_event_idx on assignments(event_id);

create table reveals (
  participant_id uuid not null references participants(id) on delete cascade,
  receiver_unit  uuid not null references units(id) on delete cascade,
  revealed_at    timestamptz not null default now(),
  primary key (participant_id, receiver_unit)
);

insert into assignments (event_id, giver_unit, receiver_unit)
  select a.event_id, g.unit_id, r.unit_id
  from assignments_v1 a
  join participants g on g.id = a.giver_id
  join participants r on r.id = a.receiver_id;

insert into reveals (participant_id, receiver_unit, revealed_at)
  select a.giver_id, r.unit_id, a.revealed_at
  from assignments_v1 a
  join participants r on r.id = a.receiver_id
  where a.revealed_at is not null;

drop table assignments_v1;

-- 3. Les rooms sont désormais rattachées à une unité
alter table messages drop constraint messages_room_id_fkey;
update messages m set room_id = p.unit_id from participants p where p.id = m.room_id;
alter table messages add constraint messages_room_id_fkey foreign key (room_id) references units(id) on delete cascade;

-- 4. Sécurité et droits
alter table units       enable row level security;
alter table assignments enable row level security;
alter table reveals     enable row level security;

grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;

commit;
