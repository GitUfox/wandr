-- Wandr accounts — trips + profile mirror (v1 sync).
--
-- Run this once in the Supabase project's SQL Editor (or `supabase db push`).
--
-- Design: the client's localStorage shapes ARE the contract (the same
-- "snapshot, not parallel schema" principle as the profile system). The server
-- stores them as opaque jsonb mirrors keyed by the client's own trip ids, so
-- when answer shapes evolve, nothing here migrates.
--
-- Security model: Row Level Security is THE boundary. The browser holds only
-- the publishable anon key; these policies are what stop user A reading user
-- B's trips. Auth is magic-link only — no passwords exist anywhere.

-- ── Trips ─────────────────────────────────────────────────────────────────
create table public.trips (
  user_id    uuid        not null references auth.users (id) on delete cascade,
  id         text        not null,            -- client tripStore id ("t…")
  data       jsonb       not null,            -- the whole trip object
  plan       jsonb,                           -- { planText, planMode } or null
  saved_at   timestamptz not null,            -- client's savedAt (LWW merge key)
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

alter table public.trips enable row level security;

create policy "own trips: select" on public.trips
  for select using (auth.uid() = user_id);
create policy "own trips: insert" on public.trips
  for insert with check (auth.uid() = user_id);
create policy "own trips: update" on public.trips
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own trips: delete" on public.trips
  for delete using (auth.uid() = user_id);

-- ── Traveler profile (one row per user) ───────────────────────────────────
create table public.profiles (
  user_id    uuid        primary key references auth.users (id) on delete cascade,
  data       jsonb       not null,            -- the wandr_profile snapshot
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "own profile: select" on public.profiles
  for select using (auth.uid() = user_id);
create policy "own profile: insert" on public.profiles
  for insert with check (auth.uid() = user_id);
create policy "own profile: update" on public.profiles
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own profile: delete" on public.profiles
  for delete using (auth.uid() = user_id);

-- updated_at maintenance (server-side, not trusted from the client)
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger trips_touch    before update on public.trips
  for each row execute function public.touch_updated_at();
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();
