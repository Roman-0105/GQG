-- ============================================================================
-- Этап 7: два новых вида заданий + деление "Описания керна" на геологическую
-- и геотехническую документацию — по разбору реального отчёта заказчику
-- (обсуждение 17.09.2026).
--
-- 1. core_description_tasks.documentation_type — геологическая и
--    геотехническая документация по одной скважине идут независимо, разным
--    темпом, иногда разным документатором. Технически это ДВА отдельных
--    задания "Описание керна" на одну скважину (разного типа), а не два
--    новых числовых поля на одном — так весь существующий код прогресса/
--    сводок/RLS работает без изменений, разница только в подписи.
--
-- 2. core_sawing_tasks (распиловка керна) — по решению заказчика ответственный
--    всегда тот же бригадир, что ведёт бурение этой скважины (foreman_id
--    берётся через drilling_task_id), поэтому только "своя" скважина,
--    без варианта "скважина подрядчика" и без отдельного назначения
--    ответственного — не как core_description_tasks.
--
-- 3. sampling_tasks (опробование) — наоборот, ответственного НАЗНАЧАЮТ
--    всегда явно (даже на своей скважине) — это может быть отдельная
--    бригада, не буровая. Поэтому структура здесь как раз похожа на
--    core_description_tasks (своя/подрядчика скважина), но
--    assigned_party_chief_id обязателен в обоих случаях.
--
-- 4. reports — три новых nullable FK (core_sawing_task_id, sampling_task_id
--    уже есть core_description_task_id/drilling_task_id) и поля под их
--    метрики. one_task_source теперь через num_nonnulls() — чище, чем
--    цепочка OR на 4 варианта.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Геологическая / геотехническая документация
-- ----------------------------------------------------------------------------
create type documentation_type as enum ('geological', 'geotechnical');

alter table core_description_tasks
  add column documentation_type documentation_type not null default 'geological';

comment on column core_description_tasks.documentation_type is
  'Геологическая или геотехническая документация — независимые задания даже на одну и ту же скважину.';

-- ----------------------------------------------------------------------------
-- 2. Распиловка керна — только своя скважина, ответственный = foreman_id
--    связанного drilling_task (см. комментарий выше)
-- ----------------------------------------------------------------------------
create table core_sawing_tasks (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references sites(id) on delete cascade,
  drilling_task_id uuid not null references drilling_tasks(id) on delete cascade,
  description text,
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now()
);

comment on table core_sawing_tasks is
  'Распиловка керна по скважине. Ответственный не назначается отдельно — это foreman_id связанного drilling_task.';

alter table core_sawing_tasks enable row level security;

create policy "core_sawing_tasks_select"
  on core_sawing_tasks for select
  using (
    is_management()
    or exists (
      select 1 from drilling_tasks dt
      where dt.id = core_sawing_tasks.drilling_task_id and dt.foreman_id = auth.uid()
    )
  );

create policy "core_sawing_tasks_write_management"
  on core_sawing_tasks for all
  using (is_management())
  with check (is_management());

-- ----------------------------------------------------------------------------
-- 3. Опробование — своя или скважина подрядчика, ответственный назначается
--    явно всегда (в отличие от core_description_tasks, где это обязательно
--    только для скважины подрядчика)
-- ----------------------------------------------------------------------------
create table sampling_tasks (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references sites(id) on delete cascade,

  drilling_task_id uuid references drilling_tasks(id) on delete cascade,
  external_well_number text,
  external_drilling_org_id uuid references drilling_organizations(id),

  assigned_party_chief_id uuid not null references profiles(id),

  description text,
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),

  constraint one_well_source check (
    (drilling_task_id is not null and external_well_number is null)
    or
    (drilling_task_id is null and external_well_number is not null)
  )
);

comment on table sampling_tasks is
  'Опробование (отбор проб). Ответственный назначается явно всегда, даже на своей скважине — это может быть отдельная бригада.';

alter table sampling_tasks enable row level security;

create policy "sampling_tasks_select"
  on sampling_tasks for select
  using (is_management() or assigned_party_chief_id = auth.uid());

create policy "sampling_tasks_write_management"
  on sampling_tasks for all
  using (is_management())
  with check (is_management());

-- ----------------------------------------------------------------------------
-- 4. reports — новые FK и поля метрик
-- ----------------------------------------------------------------------------
alter table reports add column core_sawing_task_id uuid references core_sawing_tasks(id) on delete cascade;
alter table reports add column sampling_task_id uuid references sampling_tasks(id) on delete cascade;

alter table reports add column sawn_meters numeric;
comment on column reports.sawn_meters is 'Метраж распиленного керна за смену (задание "Распиловка керна").';

alter table reports add column samples_taken integer;
alter table reports add column samples_submitted integer;
comment on column reports.samples_taken is 'Проб отобрано за смену (задание "Опробование").';
comment on column reports.samples_submitted is 'Проб сдано в лабораторию за смену (задание "Опробование").';

alter table reports drop constraint one_task_source;
alter table reports add constraint one_task_source check (
  num_nonnulls(drilling_task_id, core_description_task_id, core_sawing_task_id, sampling_task_id) = 1
);

-- ----------------------------------------------------------------------------
-- reports_insert_own — расширяем на новые виды заданий (reports_select не
-- меняется: "is_management() or author_id = auth.uid()" уже достаточно
-- общее и не завязано на конкретный вид задания).
-- ----------------------------------------------------------------------------
drop policy if exists "reports_insert_own" on reports;
create policy "reports_insert_own"
  on reports for insert
  with check (
    author_id = auth.uid()
    and (
      exists (
        select 1 from drilling_tasks dt
        where dt.id = reports.drilling_task_id and dt.foreman_id = auth.uid()
      )
      or exists (
        select 1 from core_description_tasks cdt
        left join drilling_tasks dt2 on dt2.id = cdt.drilling_task_id
        where cdt.id = reports.core_description_task_id
          and (dt2.foreman_id = auth.uid() or cdt.assigned_party_chief_id = auth.uid())
      )
      or exists (
        select 1 from core_sawing_tasks cst
        join drilling_tasks dt3 on dt3.id = cst.drilling_task_id
        where cst.id = reports.core_sawing_task_id and dt3.foreman_id = auth.uid()
      )
      or exists (
        select 1 from sampling_tasks st
        where st.id = reports.sampling_task_id and st.assigned_party_chief_id = auth.uid()
      )
    )
  );

-- sites_select / SiteDetail показывает участок бригадиру, если у него есть
-- назначение хоть на одно задание любого вида на этом участке. Заодно чиним
-- пробел из 0002: бригадир, назначенный на core_description_tasks СКВАЖИНЫ
-- ПОДРЯДЧИКА (assigned_party_chief_id), раньше не видел сам участок в
-- списке (ветки на это условие не было вообще) — только сами сводки через
-- reports_select. Теперь есть.
drop policy if exists "sites_select" on sites;
create policy "sites_select"
  on sites for select
  using (
    is_management()
    or exists (
      select 1 from drilling_tasks dt
      where dt.site_id = sites.id and dt.foreman_id = auth.uid()
    )
    or exists (
      select 1 from core_description_tasks cdt
      join drilling_tasks dt2 on dt2.id = cdt.drilling_task_id
      where cdt.site_id = sites.id and dt2.foreman_id = auth.uid()
    )
    or exists (
      select 1 from core_description_tasks cdt2
      where cdt2.site_id = sites.id and cdt2.assigned_party_chief_id = auth.uid()
    )
    or exists (
      select 1 from core_sawing_tasks cst
      join drilling_tasks dt3 on dt3.id = cst.drilling_task_id
      where cst.site_id = sites.id and dt3.foreman_id = auth.uid()
    )
    or exists (
      select 1 from sampling_tasks st
      where st.site_id = sites.id and st.assigned_party_chief_id = auth.uid()
    )
  );
