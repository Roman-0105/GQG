-- ============================================================================
-- Этап 9: буровые станки (справочник) и работники (учёт состава бригад),
-- 19.09.2026, по запросу заказчика во время работы над учётом затрат.
--
-- Раньше "номер бурового станка" на задании бурения был свободным текстом.
-- Теперь это выбор из справочника drilling_rigs, привязанного к
-- организации (своей или подрядчика) — по решению заказчика станок
-- навсегда закреплён за одной организацией, передавать между
-- организациями не нужно.
--
-- Работники — НОВАЯ сущность, отдельная от profiles/auth.users: это
-- справочник состава буровых бригад для учёта и распределения по
-- бригадирам, БЕЗ входа в приложение (решение заказчика — в отличие от
-- profiles, где role='party_chief' даёт реальный логин).
-- ============================================================================

create table drilling_rigs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references drilling_organizations(id) on delete cascade,
  rig_number text not null,
  model text, -- марка/модель, например "УРБ-2А2"
  drilling_type text, -- вид бурения: колонковое/шнековое/роторное/... — свободный текст с подсказками на фронте
  created_at timestamptz not null default now(),
  unique (organization_id, rig_number)
);

alter table drilling_tasks add column drilling_rig_id uuid references drilling_rigs(id);

-- Перенос текущих значений rig_number (свободный текст) в справочник 1:1
-- по организации, чтобы существующие задания не потеряли станок.
insert into drilling_rigs (organization_id, rig_number)
select distinct drilling_org_id, rig_number
from drilling_tasks
where rig_number is not null and rig_number <> ''
on conflict (organization_id, rig_number) do nothing;

update drilling_tasks dt
set drilling_rig_id = dr.id
from drilling_rigs dr
where dr.organization_id = dt.drilling_org_id
  and dr.rig_number = dt.rig_number;

alter table drilling_tasks drop column rig_number;

alter table drilling_rigs enable row level security;

create policy "drilling_rigs_select_all"
  on drilling_rigs for select
  using (auth.uid() is not null);

create policy "drilling_rigs_write_management"
  on drilling_rigs for all
  using (is_management())
  with check (is_management());

create table workers (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  position text, -- должность: помощник бурильщика, машинист и т.п. — свободный текст
  organization_id uuid not null references drilling_organizations(id),
  assigned_foreman_id uuid references profiles(id), -- текущая бригада; меняется вручную, истории не ведём
  created_at timestamptz not null default now()
);

alter table workers enable row level security;

create policy "workers_select_all"
  on workers for select
  using (auth.uid() is not null);

create policy "workers_write_management"
  on workers for all
  using (is_management())
  with check (is_management());
