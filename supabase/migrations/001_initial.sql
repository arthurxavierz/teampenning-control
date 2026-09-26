-- Team Penning Manager
-- Baseline relational model for the production Supabase migration.
-- The current prototype runs in localStorage so it can be tested without credentials.

create extension if not exists pgcrypto;

create type public.event_status as enum ('draft','registration_open','registration_closed','in_progress','finished','cancelled');
create type public.registration_status as enum ('awaiting_confirmation','awaiting_payment','confirmed','declined','cancelled');
create type public.confirmation_status as enum ('pending','accepted','declined');
create type public.payment_status as enum ('pending','reported','confirmed','cancelled');
create type public.run_status as enum ('pending','done','cancelled');
create type public.run_stage as enum ('qualifying','final');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  created_at timestamptz not null default now()
);

create table public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','admin','operator','finance')),
  created_at timestamptz not null default now(),
  primary key (organization_id,user_id)
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  slug text not null unique,
  status public.event_status not null default 'draft',
  event_date date not null,
  city text,
  state text,
  venue text,
  description text,
  registration_opens timestamptz,
  registration_closes timestamptz,
  registration_price numeric(12,2) not null default 0,
  cattle_max integer not null default 6,
  pix_key text,
  pix_name text,
  pix_city text,
  is_active boolean not null default false,
  is_public boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index only_one_active_event_per_org on public.events(organization_id) where is_active;

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null,
  max_handicap numeric(6,2),
  qualifying_runs integer not null default 3 check (qualifying_runs > 0),
  best_times_count integer not null default 2 check (best_times_count > 0),
  finalists_count integer not null default 12 check (finalists_count > 0),
  final_runs integer not null default 1 check (final_runs >= 0),
  carry_qualifying_score boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint best_times_not_above_runs check (best_times_count <= qualifying_runs),
  unique(event_id,name)
);

create table public.competitors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete set null,
  cpf text not null unique,
  full_name text not null,
  nickname text,
  phone text,
  contep_code text,
  current_handicap numeric(6,2),
  city text,
  state text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.contep_imports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  reference_year integer not null,
  source_filename text,
  imported_by uuid references auth.users(id) on delete set null,
  imported_at timestamptz not null default now(),
  unique(organization_id,reference_year,imported_at)
);

create table public.contep_records (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references public.contep_imports(id) on delete cascade,
  contep_code text,
  cpf text,
  full_name text not null,
  nickname text,
  city text,
  state text,
  handicap numeric(6,2) not null default 0,
  raw_data jsonb not null default '{}'::jsonb
);

create index contep_records_name_idx on public.contep_records using gin (to_tsvector('portuguese',full_name));
create index contep_records_code_idx on public.contep_records(contep_code);
create index contep_records_cpf_idx on public.contep_records(cpf);

create table public.event_competitors (
  event_id uuid not null references public.events(id) on delete cascade,
  competitor_id uuid not null references public.competitors(id) on delete cascade,
  handicap_snapshot numeric(6,2) not null default 0,
  contep_code_snapshot text,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  primary key(event_id,competitor_id)
);

create table public.registrations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete restrict,
  created_by_competitor_id uuid references public.competitors(id) on delete set null,
  status public.registration_status not null default 'awaiting_confirmation',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.registration_members (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null references public.registrations(id) on delete cascade,
  competitor_id uuid not null references public.competitors(id) on delete restrict,
  confirmation_status public.confirmation_status not null default 'pending',
  confirmed_at timestamptz,
  participation_price numeric(12,2) not null,
  payment_status public.payment_status not null default 'pending',
  created_at timestamptz not null default now(),
  unique(registration_id,competitor_id)
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  competitor_id uuid not null references public.competitors(id) on delete restrict,
  amount numeric(12,2) not null check (amount > 0),
  method text not null check(method in ('pix','cash','transfer','other','manual')),
  status public.payment_status not null default 'reported',
  txid text,
  proof_path text,
  reported_at timestamptz not null default now(),
  confirmed_at timestamptz,
  confirmed_by uuid references auth.users(id) on delete set null,
  notes text
);

create table public.payment_allocations (
  payment_id uuid not null references public.payments(id) on delete cascade,
  registration_member_id uuid not null references public.registration_members(id) on delete restrict,
  amount numeric(12,2) not null check(amount > 0),
  primary key(payment_id,registration_member_id)
);

create table public.runs (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete restrict,
  registration_id uuid not null references public.registrations(id) on delete cascade,
  stage public.run_stage not null default 'qualifying',
  round_number integer not null check(round_number > 0),
  run_number integer not null check(run_number > 0),
  cattle_number integer,
  status public.run_status not null default 'pending',
  time_seconds numeric(10,3),
  no_time boolean not null default false,
  note text,
  recorded_at timestamptz,
  recorded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(event_id,run_number)
);

create index runs_live_idx on public.runs(event_id,category_id,status,run_number);
create index registrations_event_idx on public.registrations(event_id,status);
create index members_competitor_idx on public.registration_members(competitor_id,payment_status,confirmation_status);

-- Security helpers
create or replace function public.is_org_member(target_org uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(
    select 1 from public.organization_members om
    where om.organization_id=target_org and om.user_id=auth.uid()
  );
$$;

create or replace function public.is_event_staff(target_event uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(
    select 1 from public.events e
    join public.organization_members om on om.organization_id=e.organization_id
    where e.id=target_event and om.user_id=auth.uid()
  );
$$;

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.organization_members enable row level security;
alter table public.events enable row level security;
alter table public.categories enable row level security;
alter table public.competitors enable row level security;
alter table public.contep_imports enable row level security;
alter table public.contep_records enable row level security;
alter table public.event_competitors enable row level security;
alter table public.registrations enable row level security;
alter table public.registration_members enable row level security;
alter table public.payments enable row level security;
alter table public.payment_allocations enable row level security;
alter table public.runs enable row level security;

-- Public event and live scoreboard reads
create policy events_public_read on public.events for select using (is_public = true or public.is_org_member(organization_id));
create policy categories_public_read on public.categories for select using (
  exists(select 1 from public.events e where e.id=event_id and (e.is_public=true or public.is_org_member(e.organization_id)))
);
create policy runs_public_read on public.runs for select using (
  exists(select 1 from public.events e where e.id=event_id and (e.is_public=true or public.is_org_member(e.organization_id)))
);

-- Staff administration
create policy events_staff_all on public.events for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy categories_staff_all on public.categories for all using (public.is_event_staff(event_id)) with check (public.is_event_staff(event_id));
create policy event_competitors_staff_all on public.event_competitors for all using (public.is_event_staff(event_id)) with check (public.is_event_staff(event_id));
create policy registrations_staff_all on public.registrations for all using (public.is_event_staff(event_id)) with check (public.is_event_staff(event_id));
create policy payments_staff_all on public.payments for all using (public.is_event_staff(event_id)) with check (public.is_event_staff(event_id));
create policy runs_staff_all on public.runs for all using (public.is_event_staff(event_id)) with check (public.is_event_staff(event_id));

-- Own competitor profile. Staff can also read records tied to their events.
create policy competitors_own_read on public.competitors for select using (user_id=auth.uid());
create policy competitors_own_update on public.competitors for update using (user_id=auth.uid()) with check (user_id=auth.uid());

-- Remaining participant policies should be finalized together with the authentication flow.
-- Do not expose CPF or payment data through an anonymous public policy.
