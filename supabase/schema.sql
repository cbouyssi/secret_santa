-- =============================================================
-- Secret Santa familial : schéma de base de données Supabase
-- À exécuter une seule fois dans Supabase > SQL Editor > New query
-- =============================================================

create extension if not exists pgcrypto;

-- Un événement = un tirage (ex. « Noël 2026 chez Mamie »)
create table if not exists events (
  id               uuid primary key default gen_random_uuid(),
  name             text not null check (char_length(name) between 1 and 120),
  draws_per_person int  not null default 1 check (draws_per_person between 1 and 20),
  admin_token      text not null unique,
  drawn_at         timestamptz,
  created_at       timestamptz not null default now()
);

-- Participants : pseudo + image facultative (data URL JPEG redimensionnée)
create table if not exists participants (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references events(id) on delete cascade,
  pseudo     text not null check (char_length(pseudo) between 1 and 40),
  avatar     text,
  token      text not null unique,
  created_at timestamptz not null default now()
);
create index if not exists participants_event_idx on participants(event_id);

-- Exclusions : giver ne peut pas tirer receiver (une exclusion symétrique = 2 lignes)
create table if not exists exclusions (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references events(id) on delete cascade,
  giver_id    uuid not null references participants(id) on delete cascade,
  receiver_id uuid not null references participants(id) on delete cascade,
  unique (giver_id, receiver_id),
  check (giver_id <> receiver_id)
);
create index if not exists exclusions_event_idx on exclusions(event_id);

-- Résultat du tirage : giver offre un cadeau à receiver
create table if not exists assignments (
  event_id    uuid not null references events(id) on delete cascade,
  giver_id    uuid not null references participants(id) on delete cascade,
  receiver_id uuid not null references participants(id) on delete cascade,
  revealed_at timestamptz,
  primary key (giver_id, receiver_id),
  check (giver_id <> receiver_id)
);
create index if not exists assignments_receiver_idx on assignments(receiver_id);
create index if not exists assignments_event_idx on assignments(event_id);

-- Idées de cadeaux écrites par un participant
create table if not exists ideas (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references participants(id) on delete cascade,
  title      text not null check (char_length(title) between 1 and 140),
  details    text check (char_length(details) <= 1000),
  url        text check (char_length(url) <= 600),
  created_at timestamptz not null default now()
);
create index if not exists ideas_owner_idx on ideas(owner_id);

-- Sélection d'une idée par un père Noël.
-- La clé primaire sur idea_id garantit qu'une idée ne peut être prise qu'une fois.
create table if not exists selections (
  idea_id    uuid primary key references ideas(id) on delete cascade,
  santa_id   uuid not null references participants(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Messages des rooms : room_id = le participant à qui les pères Noël offrent
create table if not exists messages (
  id         bigint generated always as identity primary key,
  room_id    uuid not null references participants(id) on delete cascade,
  author_id  uuid not null references participants(id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists messages_room_idx on messages(room_id, id);

-- Sécurité : RLS activé SANS aucune politique.
-- Résultat : les clés publiques (anon/publishable) ne peuvent rien lire ni écrire.
-- Seul le serveur Next.js, avec la clé secrète, accède aux données.
alter table events       enable row level security;
alter table participants enable row level security;
alter table exclusions   enable row level security;
alter table assignments  enable row level security;
alter table ideas        enable row level security;
alter table selections   enable row level security;
alter table messages     enable row level security;

-- Droits explicites pour la clé secrète (déjà accordés par défaut sur Supabase, sans risque si répété)
grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
