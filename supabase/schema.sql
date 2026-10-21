-- =============================================================
-- Secret Santa familial : schéma complet (version 2, avec groupes)
-- Nouvelle installation : exécuter ce fichier une seule fois dans Supabase > SQL Editor.
-- Base déjà créée avec la version 1 : exécuter plutôt migration-v2-groupes.sql.
-- =============================================================

create extension if not exists pgcrypto;

create table if not exists events (
  id               uuid primary key default gen_random_uuid(),
  name             text not null check (char_length(name) between 1 and 120),
  draws_per_person int  not null default 1 check (draws_per_person between 1 and 20),
  admin_token      text not null unique,
  drawn_at         timestamptz,
  created_at       timestamptz not null default now()
);

-- Unité de tirage : une personne seule ou un groupe (nom facultatif)
create table if not exists units (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references events(id) on delete cascade,
  name       text check (char_length(name) <= 60),
  created_at timestamptz not null default now()
);
create index if not exists units_event_idx on units(event_id);

create table if not exists participants (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references events(id) on delete cascade,
  unit_id    uuid not null references units(id),
  pseudo     text not null check (char_length(pseudo) between 1 and 40),
  avatar     text,
  token      text not null unique,
  created_at timestamptz not null default now()
);
create index if not exists participants_event_idx on participants(event_id);
create index if not exists participants_unit_idx on participants(unit_id);

-- Exclusions entre personnes (appliquées à leurs unités au moment du tirage)
create table if not exists exclusions (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references events(id) on delete cascade,
  giver_id    uuid not null references participants(id) on delete cascade,
  receiver_id uuid not null references participants(id) on delete cascade,
  unique (giver_id, receiver_id),
  check (giver_id <> receiver_id)
);
create index if not exists exclusions_event_idx on exclusions(event_id);

-- Résultat du tirage, entre unités
create table if not exists assignments (
  event_id      uuid not null references events(id) on delete cascade,
  giver_unit    uuid not null references units(id) on delete cascade,
  receiver_unit uuid not null references units(id) on delete cascade,
  primary key (giver_unit, receiver_unit),
  check (giver_unit <> receiver_unit)
);
create index if not exists assignments_receiver_idx on assignments(receiver_unit);
create index if not exists assignments_event_idx on assignments(event_id);

-- Tickets grattés : chaque membre d'un groupe gratte les siens
create table if not exists reveals (
  participant_id uuid not null references participants(id) on delete cascade,
  receiver_unit  uuid not null references units(id) on delete cascade,
  revealed_at    timestamptz not null default now(),
  primary key (participant_id, receiver_unit)
);

create table if not exists ideas (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references participants(id) on delete cascade,
  title      text not null check (char_length(title) between 1 and 140),
  details    text check (char_length(details) <= 1000),
  url        text check (char_length(url) <= 600),
  created_at timestamptz not null default now()
);
create index if not exists ideas_owner_idx on ideas(owner_id);

-- Une idée ne peut être prise que par un seul père Noël
create table if not exists selections (
  idea_id    uuid primary key references ideas(id) on delete cascade,
  santa_id   uuid not null references participants(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Messages : room_id = l'unité (personne ou groupe) à qui les pères Noël offrent
create table if not exists messages (
  id         bigint generated always as identity primary key,
  room_id    uuid not null references units(id) on delete cascade,
  author_id  uuid not null references participants(id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists messages_room_idx on messages(room_id, id);

-- RLS activé sans politique : seul le serveur (clé secrète) accède aux données
alter table events       enable row level security;
alter table units        enable row level security;
alter table participants enable row level security;
alter table exclusions   enable row level security;
alter table assignments  enable row level security;
alter table reveals      enable row level security;
alter table ideas        enable row level security;
alter table selections   enable row level security;
alter table messages     enable row level security;

grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
