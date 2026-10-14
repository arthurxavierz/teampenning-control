-- Primeira organização e responsável. Rode uma vez, depois do 001_schema.sql.
-- Troque o nome, o endereço curto (slug) e o e-mail se for instalar para outra
-- organização. Outras pessoas da equipe são adicionadas pelo painel, em Equipe.
insert into public.organizations (name, slug)
values ('CTM Team Penning', 'ctm')
on conflict (slug) do nothing;

insert into public.organization_members (organization_id, email, role, display_name)
select id, 'SEU_EMAIL_AQUI', 'owner', 'Responsável'
from public.organizations where slug = 'ctm'
on conflict (organization_id, email) do nothing;

insert into public.sync_pulse (organization_id)
select id from public.organizations where slug = 'ctm'
on conflict do nothing;
