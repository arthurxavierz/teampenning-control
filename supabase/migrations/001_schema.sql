-- Achilles Team Penning: banco de produção.
--
-- O app guarda o estado em coleções (eventos, categorias, competidores,
-- inscrições, integrantes, pagamentos, passadas, auditoria, base CONTEP). Cada
-- coleção é uma tabela com os campos principais em colunas e o restante em
-- "extra" (jsonb), espelhando src/lib/cloud/schema.js.
--
-- Segurança:
--   - Organização (usuário logado e membro): lê e grava os dados dela (RLS).
--   - Público (anon): não lê tabela nenhuma. Vê só o que as funções
--     public_base / public_event / public_contep devolvem, sem CPF completo,
--     telefone, nascimento ou dinheiro.
--   - Competidor: fala com a função do servidor (netlify/functions/portal),
--     que usa a service_role e confere CPF e telefone.

create extension if not exists pgcrypto;

-- Organização e equipe ------------------------------------------------------

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  contep_year int,
  contep_imported_at timestamptz,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  user_id uuid references auth.users(id) on delete set null,
  role text not null default 'admin' check (role in ('owner', 'admin', 'operator')),
  display_name text,
  created_at timestamptz not null default now(),
  unique (organization_id, email)
);
create index if not exists organization_members_user_idx on public.organization_members(user_id);

create or replace function public.is_org_member(org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = org and m.user_id = auth.uid()
  )
$$;

create or replace function public.is_org_admin(org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = org and m.user_id = auth.uid() and m.role in ('owner', 'admin')
  )
$$;

-- No primeiro login, o usuário assume os convites feitos para o e-mail dele.
create or replace function public.claim_membership()
returns setof public.organization_members language plpgsql security definer set search_path = public as $$
begin
  update public.organization_members
     set user_id = auth.uid()
   where user_id is null
     and lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''));
  return query select * from public.organization_members where user_id = auth.uid() order by created_at;
end $$;

-- Dados ---------------------------------------------------------------------

create table if not exists public.events (
  id text primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  slug text not null,
  status text not null default 'draft',
  active boolean not null default false,
  date date,
  registration_opens date,
  registration_closes date,
  venue text,
  city text,
  state text,
  description text,
  registration_price double precision,
  series text,
  pix jsonb,
  limits jsonb,
  terms text,
  cattle jsonb,
  schedule jsonb,
  occurrences jsonb,
  arena jsonb,
  homologated jsonb,
  extra jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default now(),
  unique (organization_id, slug)
);

create table if not exists public.categories (
  id text primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id text not null references public.events(id) on delete cascade,
  name text not null,
  max_handicap double precision,
  qualifying_runs int,
  best_times_count int,
  finalists_count int,
  final_runs int,
  carry_qualifying boolean,
  tiebreak text,
  color text,
  time_limit double precision,
  max_member_handicap double precision,
  max_age int,
  max_age_sum int,
  gender text,
  prize jsonb,
  sort_order int,
  extra jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default now()
);

create table if not exists public.competitors (
  id text primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  nickname text,
  cpf text,
  phone text,
  contep_code text,
  handicap double precision,
  handicap_source text,
  birth_date date,
  gender text,
  city text,
  extra jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default now()
);
create unique index if not exists competitors_cpf_unique on public.competitors(organization_id, cpf) where cpf is not null and cpf <> '';

create table if not exists public.registrations (
  id text primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id text not null references public.events(id) on delete cascade,
  category_id text references public.categories(id) on delete set null,
  created_by_competitor_id text,
  status text not null,
  created_at timestamptz,
  terms_accepted_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text,
  channel text,
  extra jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default now()
);

create table if not exists public.registration_members (
  id text primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  registration_id text not null references public.registrations(id) on delete cascade,
  competitor_id text not null references public.competitors(id),
  position int,
  confirmation_status text not null,
  payment_status text not null,
  handicap_snapshot double precision,
  price double precision,
  responded_at timestamptz,
  paid_at timestamptz,
  extra jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default now()
);

create table if not exists public.payments (
  id text primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id text not null references public.events(id) on delete cascade,
  competitor_id text not null references public.competitors(id),
  amount double precision not null,
  method text,
  status text not null,
  note text,
  created_at timestamptz,
  confirmed_at timestamptz,
  confirmed_by text,
  rejected_at timestamptz,
  rejected_by text,
  reject_reason text,
  extra jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default now()
);

create table if not exists public.runs (
  id text primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id text not null references public.events(id) on delete cascade,
  registration_id text not null references public.registrations(id) on delete cascade,
  category_id text references public.categories(id) on delete cascade,
  stage text not null,
  runoff_for text,
  round int,
  number int not null,
  cattle int,
  status text not null,
  time double precision,
  occurrence text,
  note text,
  recorded_at timestamptz,
  recorded_by text,
  extra jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default now()
);

create table if not exists public.audit_log (
  id text primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id text,
  at timestamptz not null default now(),
  actor text,
  action text,
  summary text,
  detail jsonb,
  extra jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default now()
);

create table if not exists public.contep_records (
  id text primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contep_code text,
  name text,
  cpf text,
  handicap double precision,
  extra jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default now()
);

create table if not exists public.contep_imports (
  id text primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  at timestamptz not null default now(),
  extra jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default now()
);

-- Tentativas de acesso ao portal do competidor (limite contra chute de dígitos).
create table if not exists public.portal_attempts (
  id bigserial primary key,
  organization_id uuid,
  cpf text not null,
  ok boolean not null,
  at timestamptz not null default now()
);
create index if not exists portal_attempts_cpf_idx on public.portal_attempts(cpf, at desc);

-- Pulso: muda a cada alteração pública. O site público escuta só esta tabela
-- e, quando ela muda, busca de novo o que precisa pelas funções public_*.
create table if not exists public.sync_pulse (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  version bigint not null default 0,
  changed_at timestamptz not null default now()
);

-- Índices, RLS, gatilhos ----------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['events','categories','competitors','registrations','registration_members','payments','runs','audit_log','contep_records','contep_imports'] loop
    execute format('create index if not exists %I on public.%I(organization_id)', t || '_org_idx', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists org_members_all on public.%I', t);
    execute format('create policy org_members_all on public.%I for all to authenticated using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id))', t);
  end loop;
end $$;

create index if not exists categories_event_idx on public.categories(event_id);
create index if not exists registrations_event_idx on public.registrations(event_id);
create index if not exists members_registration_idx on public.registration_members(registration_id);
create index if not exists members_competitor_idx on public.registration_members(competitor_id);
create index if not exists payments_event_idx on public.payments(event_id, competitor_id);
create index if not exists runs_event_idx on public.runs(event_id, number);
create index if not exists audit_log_at_idx on public.audit_log(organization_id, at desc);

alter table public.organizations enable row level security;
drop policy if exists org_select on public.organizations;
create policy org_select on public.organizations for select to authenticated using (public.is_org_member(id));
drop policy if exists org_update on public.organizations;
create policy org_update on public.organizations for update to authenticated using (public.is_org_member(id)) with check (public.is_org_member(id));

alter table public.organization_members enable row level security;
drop policy if exists members_select on public.organization_members;
create policy members_select on public.organization_members for select to authenticated
  using (user_id = auth.uid() or public.is_org_member(organization_id));
drop policy if exists members_admin_write on public.organization_members;
create policy members_admin_write on public.organization_members for all to authenticated
  using (public.is_org_admin(organization_id)) with check (public.is_org_admin(organization_id));

alter table public.portal_attempts enable row level security;

alter table public.sync_pulse enable row level security;
drop policy if exists pulse_read on public.sync_pulse;
create policy pulse_read on public.sync_pulse for select to anon, authenticated using (true);

create or replace function public.touch_synced_at()
returns trigger language plpgsql as $$
begin
  new.synced_at := now();
  return new;
end $$;

create or replace function public.bump_pulse()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    insert into public.sync_pulse (organization_id, version, changed_at)
    select distinct organization_id, 1, now() from old_rows
    on conflict (organization_id) do update set version = public.sync_pulse.version + 1, changed_at = now();
  else
    insert into public.sync_pulse (organization_id, version, changed_at)
    select distinct organization_id, 1, now() from new_rows
    on conflict (organization_id) do update set version = public.sync_pulse.version + 1, changed_at = now();
  end if;
  return null;
end $$;

do $$
declare
  t text;
begin
  foreach t in array array['events','categories','competitors','registrations','registration_members','payments','runs','audit_log','contep_records','contep_imports'] loop
    execute format('drop trigger if exists touch_synced_at on public.%I', t);
    execute format('create trigger touch_synced_at before update on public.%I for each row execute function public.touch_synced_at()', t);
  end loop;
  foreach t in array array['events','categories','competitors','registrations','registration_members','runs'] loop
    execute format('drop trigger if exists pulse_ins on public.%I', t);
    execute format('drop trigger if exists pulse_upd on public.%I', t);
    execute format('drop trigger if exists pulse_del on public.%I', t);
    execute format('create trigger pulse_ins after insert on public.%I referencing new table as new_rows for each statement execute function public.bump_pulse()', t);
    execute format('create trigger pulse_upd after update on public.%I referencing new table as new_rows for each statement execute function public.bump_pulse()', t);
    execute format('create trigger pulse_del after delete on public.%I referencing old table as old_rows for each statement execute function public.bump_pulse()', t);
  end loop;
end $$;

-- Funções públicas ----------------------------------------------------------

create or replace function public.resolve_org(p_org text)
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.organizations
   where p_org is null or p_org = '' or slug = p_org
   order by created_at
   limit 1
$$;

-- CPF parcialmente escondido: só o terceiro bloco aparece.
create or replace function public.mask_cpf(cpf text)
returns text language sql immutable as $$
  select case when length(coalesce(cpf, '')) = 11
    then '***.***.' || substr(cpf, 7, 3) || '-**' else '' end
$$;

create or replace function public.public_base(p_org text default null)
returns jsonb language sql stable security definer set search_path = public as $$
  with org as (select * from public.organizations where id = public.resolve_org(p_org)),
  evs as (select e.* from public.events e, org where e.organization_id = org.id and e.status <> 'draft')
  select jsonb_build_object(
    'organization', (select jsonb_build_object('id', id, 'name', name, 'slug', slug, 'settings', settings, 'contep_year', contep_year) from org),
    'events', coalesce((select jsonb_agg(to_jsonb(evs)) from evs), '[]'::jsonb),
    'categories', coalesce((select jsonb_agg(to_jsonb(c)) from public.categories c where c.event_id in (select id from evs)), '[]'::jsonb),
    'competitors', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'name', c.name, 'nickname', c.nickname, 'contep_code', c.contep_code,
        'handicap', c.handicap, 'handicap_source', c.handicap_source, 'city', c.city,
        'extra', jsonb_build_object('cpfMasked', public.mask_cpf(c.cpf))))
      from public.competitors c, org where c.organization_id = org.id), '[]'::jsonb),
    'pulse', (select version from public.sync_pulse p, org where p.organization_id = org.id)
  )
$$;

create or replace function public.public_event(p_event_slug text, p_org text default null)
returns jsonb language sql stable security definer set search_path = public as $$
  with ev as (
    select e.* from public.events e
     where e.organization_id = public.resolve_org(p_org) and e.slug = p_event_slug and e.status <> 'draft'
  ),
  regs as (select r.* from public.registrations r where r.event_id in (select id from ev))
  select case when not exists (select 1 from ev) then null else jsonb_build_object(
    'event_id', (select id from ev),
    'registrations', coalesce((select jsonb_agg(to_jsonb(regs) - 'cancel_reason') from regs), '[]'::jsonb),
    'members', coalesce((
      select jsonb_agg(to_jsonb(m) - 'payment_status' - 'price' - 'paid_at')
        from public.registration_members m where m.registration_id in (select id from regs)), '[]'::jsonb),
    'runs', coalesce((
      select jsonb_agg(to_jsonb(r)) from public.runs r
       where r.event_id in (select id from ev)
         and (r.status = 'done' or (select (schedule ->> 'publishedAt') is not null from ev))), '[]'::jsonb)
  ) end
$$;

create or replace function public.public_contep(p_org text default null)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'contep_code', r.contep_code, 'name', r.name, 'handicap', r.handicap)), '[]'::jsonb)
    from public.contep_records r
   where r.organization_id = public.resolve_org(p_org)
$$;

revoke all on function public.public_base(text) from public;
revoke all on function public.public_event(text, text) from public;
revoke all on function public.public_contep(text) from public;
grant execute on function public.public_base(text) to anon, authenticated;
grant execute on function public.public_event(text, text) to anon, authenticated;
grant execute on function public.public_contep(text) to anon, authenticated;
grant execute on function public.claim_membership() to authenticated;

-- Realtime ------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['sync_pulse','organizations','events','categories','competitors','registrations','registration_members','payments','runs','audit_log','contep_imports'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
