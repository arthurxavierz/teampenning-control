-- Team Penning Manager
-- Acompanha o protótipo: regras configuráveis por evento, ocorrências de pista,
-- snapshot de handicap, crédito por pagamento, homologação e auditoria.
-- Ainda não foi executada em nenhum projeto Supabase.

alter type public.payment_status add value if not exists 'rejected';

-- Evento: regras que ficam na configuração e não no código.
alter table public.events
  add column if not exists limits jsonb not null default '{"maxPerCompetitor": 8, "maxSameTrio": 1}'::jsonb,
  add column if not exists terms text,
  add column if not exists cattle jsonb not null default '{"min": 0, "max": 6, "mode": "draw"}'::jsonb,
  add column if not exists schedule jsonb not null default '{"minGap": 2, "mode": "mixed"}'::jsonb,
  add column if not exists schedule_seed integer,
  add column if not exists schedule_generated_at timestamptz,
  add column if not exists schedule_published_at timestamptz,
  add column if not exists arena jsonb not null default '{"mode": "tv", "rotationSeconds": 10, "intermission": false}'::jsonb;

create table if not exists public.event_occurrences (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  code text not null,
  label text not null,
  effect text not null check (effect in ('no_time', 'penalty', 'disqualified')),
  penalty_seconds numeric(8,3) not null default 0,
  sort_order integer not null default 0,
  unique (event_id, code)
);

alter table public.categories
  add column if not exists tiebreak text not null default 'best_single' check (tiebreak in ('best_single', 'last_valid', 'shared')),
  add column if not exists color text;

create table if not exists public.category_homologations (
  category_id uuid primary key references public.categories(id) on delete cascade,
  homologated_at timestamptz not null default now(),
  homologated_by uuid references auth.users(id) on delete set null
);

-- Competidor: de onde veio o handicap. "declared" precisa de conferência.
alter table public.competitors
  add column if not exists handicap_source text not null default 'contep' check (handicap_source in ('contep', 'declared', 'admin'));

-- Inscrição: aceite do regulamento, cancelamento e snapshot por integrante.
alter table public.registrations
  add column if not exists terms_accepted_at timestamptz,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancel_reason text;

alter table public.registration_members
  add column if not exists handicap_snapshot numeric(6,2) not null default 0,
  add column if not exists paid_at timestamptz;

alter table public.payments
  add column if not exists rejected_at timestamptz,
  add column if not exists rejected_by uuid references auth.users(id) on delete set null,
  add column if not exists reject_reason text;

-- Pista: ocorrência codificada no lugar do antigo booleano no_time.
alter table public.runs
  add column if not exists occurrence_code text,
  add column if not exists updated_at timestamptz,
  add column if not exists updated_by uuid references auth.users(id) on delete set null;

-- Mesma passada não pode ser lançada duas vezes: a atualização só vale se
-- ainda estiver pendente. A aplicação usa "update ... where status = 'pending'".
create index if not exists runs_pending_idx on public.runs(event_id, run_number) where status = 'pending';

create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  organization_id uuid references public.organizations(id) on delete cascade,
  event_id uuid references public.events(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  actor_name text,
  action text not null,
  summary text not null,
  detail jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_log_event_idx on public.audit_log(event_id, created_at desc);
alter table public.audit_log enable row level security;
alter table public.event_occurrences enable row level security;
alter table public.category_homologations enable row level security;

create policy audit_staff_read on public.audit_log for select using (public.is_event_staff(event_id) or public.is_org_member(organization_id));
create policy audit_staff_insert on public.audit_log for insert with check (public.is_event_staff(event_id) or public.is_org_member(organization_id));
-- Sem update nem delete: o registro de auditoria é só de acréscimo.

create policy occurrences_public_read on public.event_occurrences for select using (true);
create policy occurrences_staff_all on public.event_occurrences for all using (public.is_event_staff(event_id)) with check (public.is_event_staff(event_id));
create policy homologations_public_read on public.category_homologations for select using (true);
create policy homologations_staff_all on public.category_homologations for all
  using (exists (select 1 from public.categories c where c.id = category_id and public.is_event_staff(c.event_id)))
  with check (exists (select 1 from public.categories c where c.id = category_id and public.is_event_staff(c.event_id)));

-- O competidor pode editar o próprio cadastro, mas não o handicap nem o
-- código CONTEP. Na 001 a policy de update liberava a linha inteira.
create or replace function public.protect_competitor_handicap()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (new.current_handicap is distinct from old.current_handicap or new.contep_code is distinct from old.contep_code or new.handicap_source is distinct from old.handicap_source)
     and not exists (select 1 from public.organization_members om where om.user_id = auth.uid()) then
    raise exception 'Handicap e código CONTEP são alterados apenas pela organização.';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists competitors_protect_handicap on public.competitors;
create trigger competitors_protect_handicap before update on public.competitors
  for each row execute function public.protect_competitor_handicap();
